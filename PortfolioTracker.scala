package sudheer.portfolio

object PortfolioTracker {
  def main(args: Array[String]): Unit = {
    val interestFile = "/Users/sudheerpendyala/projects/Projects/scala/scala_assignments/src/main/scala/sudheer/portfolio/fd_interest_rate.csv"
    val fdManager = FDManager.load(interestFile)
    // println("Loaded FD manager")

    val userFile = "/Users/sudheerpendyala/projects/Projects/scala/scala_assignments/src/main/scala/sudheer/portfolio/users.csv"
    val userMap = User.load(userFile)
    val transactionFile = "/Users/sudheerpendyala/projects/Projects/scala/scala_assignments/src/main/scala/sudheer/portfolio/transactions.csv"
    val transactions = Transactions.loadTransactions(transactionFile, fdManager, userMap)
    transactions.userLevelStatistics()
  }
}