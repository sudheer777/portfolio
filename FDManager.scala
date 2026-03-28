package sudheer.portfolio

import scala.collection.mutable

case class FDManager() {
  private val fds: mutable.Map[String, FDType] = mutable.Map[String, FDType](
    "stocks" -> Stocks(),
    "mutual funds" -> MutualFunds(),
    "nps" -> NPS()
  )

  def getFDType(t: String): FDType = fds.getOrElse(t, throw new Exception(s"Unsupported fd type $t"))

  def close(): Unit = {
    fds.foreach(_._2.close())
  }

  def addRecord(row: String): Unit = {
    val l = row.split(",")
    val (fdType, date, rate) = (l(0).toLowerCase(), l(1), l(2).toDouble)
    fdType match {
      case "ppf" | "epf" =>
        val fd = fds.getOrElse(fdType, if (fdType == "ppf") new PPF else new EPF)
        fd.insertRecord(date, rate)
        fds(fdType) = fd
      case _ => throw new RuntimeException(s"Unsupported fdtype ${fdType}")
    }
  }
}

object FDManager {
  def load(file: String): FDManager = {
    val content = scala.io.Source.fromFile(file)
    val lines = content.getLines()
    // skip header
    lines.next()
    val res = new FDManager()
    lines.foreach(res.addRecord)
    content.close()
    res.close()
    res
  }
}