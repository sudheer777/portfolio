package sudheer.portfolio

abstract class OtherType() extends FDType {
  override def close(): Unit = {}

  override def computeInterest(transaction: Transaction): Amount = Amount(transaction.amount, 0D, 0D)
}

case class Stocks() extends OtherType {
  override val name: String = "Stocks"
}

case class MutualFunds() extends OtherType {
  override val name: String = "Mutual funds"
}

case class NPS() extends OtherType {
  override val name: String = "NPS"
}