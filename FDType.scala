package sudheer.portfolio

import java.time.LocalDate
import scala.annotation.tailrec
import scala.collection.mutable

trait FDType {
  private val interestRecords: mutable.Map[DateUtils.Date, Double] = mutable.Map[DateUtils.Date, Double]()
  protected val interestDates: mutable.ArrayBuffer[DateUtils.Date] = mutable.ArrayBuffer[DateUtils.Date]()
  private var interestDatesSorted = Array[DateUtils.Date]()
  protected val financialEndMonth: Int = 3
  protected val financialEndDate: Int = 31
  // make it enum and support other types
  protected val compoundType = "YEARLY"
  private val currentDate = {
    val d = LocalDate.now()
    new DateUtils.Date(d.getYear, d.getMonthValue, d.getDayOfMonth)
  }
  private val prevDate = currentDate.-(1)

  val name: String

  def insertRecord(date: String, rate: Double): Unit = {
    val d = DateUtils.Date(date)
    interestDates.append(d)
    interestRecords(d) = rate
  }

  def close(): Unit = {
    if (interestDates.isEmpty) {
      throw new Exception("There should be atleast one entry for interest")
    }
    interestDatesSorted = interestDates.sortBy(_.toString).toArray
  }

  def getInterestRate(date: DateUtils.Date): Double = interestRecords(date)

  def getFinancialYearEnd(date: DateUtils.Date): DateUtils.Date = {
    val year = if (date.month < financialEndMonth) {
      date.year
    } else if (date.month == financialEndMonth && date.date <= financialEndDate) {
      date.year
    } else date.year + 1
    new DateUtils.Date(year, financialEndMonth, financialEndDate)
  }

  def computeInterestForDate(date1: DateUtils.Date, date2: DateUtils.Date, amount: Double, rate: Double): Double = {
    val diff = date1.dateDiff(date2+1)
    // println(s"date1: $date1, date2: $date2, diff: $diff, amount: $amount, rate: $rate")
    val yearInterest = amount * rate / 100
    val monthInterest = yearInterest / 12
    (diff._1 * yearInterest) + (diff._2 * monthInterest) + (diff._3 * monthInterest / date2.daysOfMonth)
  }

  def computeInterest(transaction: Transaction): Amount = {
    // can be done using binary search
    val ind = interestDatesSorted.indexWhere(x => x > transaction.utilDate) match {
      case -1 => interestDatesSorted.length - 1
      case 0 => 0
      case x => x - 1
    }

    @tailrec
    def helper(amount: Double, interest: Double, date: DateUtils.Date, endDate: DateUtils.Date, ind: Int): Double = {
      // println(s"amount: $amount, int: $interest, date: $date, ind: $ind")
      val rate = getInterestRate(interestDatesSorted(ind))
      val fend = getFinancialYearEnd(date)
      if (ind == interestDatesSorted.length - 1) {
        if (endDate <= fend) {
          amount + interest + computeInterestForDate(date, endDate, amount, rate)
        } else {
          helper(amount + interest + computeInterestForDate(date, fend, amount, rate), 0, fend+1, endDate, ind)
        }
      } else {
        val nextInterestDate = interestDatesSorted(ind + 1)
        val min = Array(fend, nextInterestDate-1, endDate).minBy(_.toString)
        // println(s"List: ${List(fend, nextInterestDate-1, currentDate)}, min: $min, fend: $fend, bool: ${min.toString == fend.toString}")
        min.toString match {
          case x if x == endDate.toString => amount + interest + computeInterestForDate(date, endDate, amount, rate)
          case x if x == fend.toString =>
            // corner needs to be addressed when fend and nextInterestDate-1 are same
            helper(amount + interest + computeInterestForDate(date, fend, amount, rate), 0, fend+1, endDate, ind)
          case x =>
            helper(amount, interest + computeInterestForDate(date, nextInterestDate-1, amount, rate), nextInterestDate, endDate, ind+1)
        }
      }
    }
    val interest = helper(transaction.amount, 0, transaction.utilDate, currentDate, ind) - transaction.amount
    // TODO: Optimize below
    val interestPrevDay = helper(transaction.amount, 0, transaction.utilDate, prevDate, ind) - transaction.amount
    Amount(transaction.amount, interest, interest - interestPrevDay)
  }
}