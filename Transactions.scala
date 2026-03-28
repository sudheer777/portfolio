package sudheer.portfolio

import scala.collection.mutable

case class Transaction(transactionType: String, fdType: String, amount: Double, date: String, userId: Long) {
  val utilDate: DateUtils.Date = DateUtils.Date(date)

  transactionType.toLowerCase() match {
    case "credit" | "debit" =>
    case _ => throw new Exception("unsupported transaction type")
  }
}

case class Amount(principal: Double, interest: Double, dayChange: Double) {
  def +(a: Amount): Amount = {
    Amount(a.principal+this.principal, a.interest+this.interest, a.dayChange+this.dayChange)
  }

  val finalAmount: Double = principal + interest
}

case class AggKey(fdType: String, userId: Long)

case class Transactions(fDManager: FDManager, userMap: Map[Long, User]) {
  private val transactions = mutable.Map[AggKey, Amount]()

  def addTransaction(transaction: Transaction): Unit = {
    if (!userMap.contains(transaction.userId)) {
      throw new RuntimeException(s"Unknown user id: ${transaction.userId}")
    }
    val ft = transaction.fdType.toLowerCase
    val k = AggKey(ft, transaction.userId)
    transactions(k) = fDManager.getFDType(ft).computeInterest(transaction).+(transactions.getOrElse(k, Amount(0D, 0D, 0D)))
  }

  def fString(d: Double): String = {
    val totLen = 15
    if (d < 1000) {
      val k = "%.2f".format(d)
      " " * (totLen - k.length) + k
    } else {
      val k = "%.2f".format(d).reverse
      val head = k.substring(6)
      val k1 = head.grouped(2).mkString(",").reverse + "," + k.substring(0, 6).reverse
      " " * (totLen - k1.length) + k1
    }
  }

  def userLevelStatistics(): Unit = {
    var totalAmount = 0D
    var totalInterest = 0D
    var totalDayChange = 0D
    transactions.groupBy(_._1.userId).toList.sortBy(_._1).foreach(x => {
      val userName = userMap(x._1).name
      println(s"-----------------User: $userName----------------")
      var amount = 0D
      var interest = 0D
      var dayChange = 0D
      x._2.foreach(y => {
        println(s"${y._1.fdType.toUpperCase()}:")
        amount += y._2.principal
        interest += y._2.interest
        dayChange += y._2.dayChange
        println(s"\t-------------------------------")
        println(s"\t|   Invested| ${fString(y._2.principal)} |")
        println(s"\t|   Interest| ${fString(y._2.interest)} |")
        println(s"\t| Day change| ${fString(y._2.dayChange)} |")
        println(s"\t-------------------------------")
        println(s"\t|      Total| ${fString(y._2.finalAmount)} |")
        println(s"\t-------------------------------")
      })
      totalAmount += amount
      totalInterest += interest
      totalDayChange += dayChange
      println(s"Across all Fds:")
      println(s"\t-------------------------------")
      println(s"\t|   Invested| ${fString(amount)} |")
      println(s"\t|   Interest| ${fString(interest)} |")
      println(s"\t| Day Change| ${fString(dayChange)} |")
      println(s"\t-------------------------------")
      println(s"\t|      Total| ${fString(amount + interest)} |")
      println(s"\t-------------------------------")
      println(s"-----------------User: $userName----------------\n")
    })

    println(s"Across all users and fd types:")
    println(s"\t-------------------------------")
    println(s"\t|   Invested| ${fString(totalAmount)} |")
    println(s"\t|   Interest| ${fString(totalInterest)} |")
    println(s"\t| Day change| ${fString(totalDayChange)} |")
    println(s"\t-------------------------------")
    println(s"\t|      Total| ${fString(totalAmount + totalInterest)} |")
    println(s"\t-------------------------------")
  }
}

object Transactions {
  def load(row: String): Transaction = {
    val l = row.split(",")
    Transaction(l(0), l(1), l(3).toDouble, l(2), l(4).toLong)
  }

  def loadTransactions(file: String, fDManager: FDManager, userMap: Map[Long, User]): Transactions = {
    val content = scala.io.Source.fromFile(file)
    val lines = content.getLines()
    // skip header
    lines.next()
    val tres = new Transactions(fDManager, userMap)
    lines.foreach(x => tres.addTransaction(load(x)))
    content.close()
    tres
  }
}
