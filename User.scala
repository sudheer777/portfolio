package sudheer.portfolio

case class User(id: Long, name: String)

object User {
  def apply(row: String): User = {
    val l = row.split(",")
    new User(l(0).toLong, l(1))
  }

  def load(file: String): Map[Long, User] = {
    val content = scala.io.Source.fromFile(file)
    val lines = content.getLines()
    // skip header
    lines.next()
    val res = lines.map(x => {
      val k = User(x)
      (k.id, k)
    }).toMap
    content.close()
    res
  }
}
