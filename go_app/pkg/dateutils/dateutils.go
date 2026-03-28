package dateutils

import (
	"fmt"
	"math"
	"time"
)

// Date represents a date with year, month, and day
type Date struct {
	Year  int
	Month int
	Day   int
}

func NewDate(t time.Time) Date {
	return Date{
		Year:  t.Year(),
		Month: int(t.Month()),
		Day:   t.Day(),
	}
}

func ParseDate(dateStr string) (Date, error) {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return Date{}, err
	}
	return NewDate(t), nil
}

func (d Date) ToTime() time.Time {
	return time.Date(d.Year, time.Month(d.Month), d.Day, 0, 0, 0, 0, time.UTC)
}

func (d Date) String() string {
	return fmt.Sprintf("%04d%02d%02d", d.Year, d.Month, d.Day)
}

func (d Date) After(other Date) bool {
	return d.ToTime().After(other.ToTime())
}

func (d Date) BeforeOrEqual(other Date) bool {
	return !d.After(other)
}

func (d Date) AddDays(days int) Date {
	return NewDate(d.ToTime().AddDate(0, 0, days))
}

func (d Date) SubDays(days int) Date {
	return NewDate(d.ToTime().AddDate(0, 0, -days))
}

func (d Date) DaysOfMonth() int {
	// Logic to get days in month: go to next month day 0
	nextMonth := time.Date(d.Year, time.Month(d.Month+1), 0, 0, 0, 0, 0, time.UTC)
	return nextMonth.Day()
}

// DateDiff returns years, months, days difference
// Porting logic to match typical Period behavior (e.g. Java Period) roughly
func (d Date) DateDiff(other Date) (int, int, int) {
	d1 := d.ToTime()
	d2 := other.ToTime()

	if d1.After(d2) {
		d1, d2 = d2, d1
	}

	y1, m1, day1 := d1.Date()
	y2, m2, day2 := d2.Date()

	years := y2 - y1
	months := int(m2) - int(m1)
	days := day2 - day1

	if days < 0 {
		months--
		// borrowing days from previous month
		t := time.Date(y2, m2, 0, 0, 0, 0, 0, time.UTC)
		days += t.Day()
	}

	if months < 0 {
		years--
		months += 12
	}

	return int(math.Abs(float64(years))), int(math.Abs(float64(months))), int(math.Abs(float64(days)))
}
