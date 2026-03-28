package sudheer.portfolio

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.Period

object DateUtils {
  private val dateFormat = DateTimeFormatter.ofPattern("yyyyMMdd")

  case class Date(year: Int, month: Int, date: Int) {
    val localDate: LocalDate = LocalDate.of(this.year, this.month, this.date)
    lazy val daysOfMonth: Int = localDate.lengthOfMonth()

    override def toString: String = {
      localDate.format(dateFormat)
    }

    override def equals(obj: Any): Boolean = {
      obj.isInstanceOf[Date] && obj.asInstanceOf[Date].toString == date.toString
    }

    def >(d: Date): Boolean = {
      localDate.isAfter(d.localDate)
    }

    def <=(d: Date): Boolean = {
      !this.>(d)
    }

    def +(days: Int): Date = {
      val l = localDate.plusDays(days)
      new Date(l.getYear, l.getMonthValue, l.getDayOfMonth)
    }

    def -(days: Int): Date = {
      val l = localDate.minusDays(days)
      new Date(l.getYear, l.getMonthValue, l.getDayOfMonth)
    }

    def dateDiff(date1: Date): (Int, Int, Int) = {
      val period = Period.between(date1.localDate, localDate)
      val years = math.abs(period.getYears)
      val months = math.abs(period.getMonths)
      val days = math.abs(period.getDays)
      (years, months, days)
    }
  }

  object Date {
    def apply(d: String): Date = {
      val k = d.split("-")
      new Date(k(0).toInt, k(1).toInt, k(2).toInt)
    }
  }
}
