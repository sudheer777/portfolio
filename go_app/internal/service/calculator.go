package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"portfolio/internal/models"
	"portfolio/pkg/dateutils"
)

type Calculator interface {
	ComputeInterest(t models.Transaction) models.Amount
}

type FDManager struct {
	fds map[string]*FDType
}

func NewFDManager() *FDManager {
	return &FDManager{
		fds: map[string]*FDType{
			"ppf":          NewFDType("PPF"),
			"epf":          NewFDType("EPF"),
			"stocks":       NewFDType("Stocks"),
			"mutual funds": NewFDType("Mutual Funds"),
			"nps":          NewFDType("NPS"),
		},
	}
}

func (m *FDManager) GetFD(fdType string) (*FDType, error) {
	fd, ok := m.fds[strings.ToLower(fdType)]
	if !ok {
		// Fallback or error
		// For now returning a default if not found or treating as "Other"
		// Logic in Scala checks "stocks" etc manually
		return nil, fmt.Errorf("unsupported fd type: %s", fdType)
	}
	return fd, nil
}

func (m *FDManager) AddRate(fdType string, dateStr string, rate float64) error {
	fd, ok := m.fds[strings.ToLower(fdType)]
	if !ok {
		return fmt.Errorf("unsupported fd type for rate addition: %s", fdType)
	}
	// Stocks/MFs don't use rates in this calc, but we can just ignore or store
	// Scala logic only adds for PPF/EPF
	return fd.InsertRecord(dateStr, rate)
}

type FDType struct {
	Name                string
	InterestRecords     map[string]float64
	InterestDates       []dateutils.Date
	InterestDatesSorted []dateutils.Date
}

func NewFDType(name string) *FDType {
	return &FDType{
		Name:            name,
		InterestRecords: make(map[string]float64),
		InterestDates:   make([]dateutils.Date, 0),
	}
}

func (fd *FDType) InsertRecord(dateStr string, rate float64) error {
	d, err := dateutils.ParseDate(dateStr)
	if err != nil {
		return err
	}
	fd.InterestDates = append(fd.InterestDates, d)
	fd.InterestRecords[d.String()] = rate
	// Sort
	fd.sortDates()
	return nil
}

func (fd *FDType) sortDates() {
	sort.Slice(fd.InterestDates, func(i, j int) bool {
		return fd.InterestDates[j].After(fd.InterestDates[i])
	})
	fd.InterestDatesSorted = fd.InterestDates // Already sorted by Slice? No Slice sorts [i] vs [j] logic.
	// Wait, Slice expects i < j logic.
	// We want ascending order. date i before date j.
	sort.Slice(fd.InterestDates, func(i, j int) bool {
		return fd.InterestDates[i].BeforeOrEqual(fd.InterestDates[j]) && fd.InterestDates[i].String() != fd.InterestDates[j].String()
	})
	fd.InterestDatesSorted = fd.InterestDates
}

func (fd *FDType) GetInterestRate(d dateutils.Date) float64 {
	return fd.InterestRecords[d.String()]
}

func (fd *FDType) ComputeInterest(t models.Transaction) models.Amount {
	lower := strings.ToLower(fd.Name)
	if lower == "stocks" || lower == "mutual funds" || lower == "nps" {
		return models.Amount{Principal: t.Amount, Interest: 0, DayChange: 0, FinalAmount: t.Amount}
	}

	utilDate := dateutils.NewDate(t.Date)
	currentDate := dateutils.NewDate(time.Now())
	prevDate := currentDate.SubDays(1)

	// find index
	ind := -1
	for i, d := range fd.InterestDatesSorted {
		if d.After(utilDate) {
			ind = i
			break
		}
	}

	startInd := 0
	if ind == -1 {
		startInd = len(fd.InterestDatesSorted) - 1
	} else if ind == 0 {
		startInd = 0
	} else {
		startInd = ind - 1
	}

	interest := fd.helper(t.Amount, 0, utilDate, currentDate, startInd) - t.Amount
	interestPrev := fd.helper(t.Amount, 0, utilDate, prevDate, startInd) - t.Amount

	return models.Amount{
		Principal:   t.Amount,
		Interest:    interest,
		DayChange:   interest - interestPrev,
		FinalAmount: t.Amount + interest,
	}
}

func (fd *FDType) helper(amount, interest float64, d, endDate dateutils.Date, ind int) float64 {
	rate := fd.GetInterestRate(fd.InterestDatesSorted[ind])
	fEnd := fd.getFinancialYearEnd(d)

	if ind == len(fd.InterestDatesSorted)-1 {
		if endDate.BeforeOrEqual(fEnd) {
			return amount + interest + fd.computeInterestForDate(d, endDate, amount, rate)
		}
		return fd.helper(amount+interest+fd.computeInterestForDate(d, fEnd, amount, rate), 0, fEnd.AddDays(1), endDate, ind)
	}

	nextInterestDate := fd.InterestDatesSorted[ind+1]
	// min of fEnd, nextInterestDate-1, endDate
	nextIntPrev := nextInterestDate.SubDays(1)

	// find min
	target := fEnd
	if nextIntPrev.BeforeOrEqual(target) {
		target = nextIntPrev
	}
	if endDate.BeforeOrEqual(target) {
		target = endDate
	}

	if target.String() == endDate.String() {
		return amount + interest + fd.computeInterestForDate(d, endDate, amount, rate)
	}
	if target.String() == fEnd.String() {
		return fd.helper(amount+interest+fd.computeInterestForDate(d, fEnd, amount, rate), 0, fEnd.AddDays(1), endDate, ind)
	}
	return fd.helper(amount, interest+fd.computeInterestForDate(d, nextIntPrev, amount, rate), nextInterestDate, endDate, ind+1)
}

func (fd *FDType) getFinancialYearEnd(d dateutils.Date) dateutils.Date {
	fyMonth := 3
	fyDay := 31
	year := d.Year
	if d.Month < fyMonth {
		// e.g. Feb 2025 -> FY end 2025
	} else if d.Month == fyMonth && d.Day <= fyDay {
		// e.g. Mar 15 2025 -> FY end 2025
	} else {
		// e.g. Apr 2025 -> FY end 2026
		year++
	}
	return dateutils.Date{Year: year, Month: fyMonth, Day: fyDay}
}

func (fd *FDType) computeInterestForDate(d1, d2 dateutils.Date, amount, rate float64) float64 {
	d2Adj := d2.AddDays(1)
	y, m, d := d1.DateDiff(d2Adj)

	yearInterest := amount * rate / 100
	monthInterest := yearInterest / 12
	// Scala: (diff._1 * yearInterest) + (diff._2 * monthInterest) + (diff._3 * monthInterest / date2.daysOfMonth)
	// d1 vs d2. The Scala code passed date2 to daysOfMonth.
	// Actually in Scala: diff is between date1 and date2+1.
	// days part is divided by date2.daysOfMonth.

	daysFraction := float64(d) * monthInterest / float64(d2.DaysOfMonth())

	return (float64(y) * yearInterest) + (float64(m) * monthInterest) + daysFraction
}
