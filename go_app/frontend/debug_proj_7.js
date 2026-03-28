
const P = 228115.83;
const T_Actual = 275611;
const T_Expected = 276019;
const Years = 2;
const Months = 24;

console.log(`P: ${P}, T_Actual: ${T_Actual}, T_Expected: ${T_Expected}`);

// 1. Check implied Annual Rate
const impliedTotalGrowth = T_Actual / P;
const impliedAnnualGrowth = Math.pow(impliedTotalGrowth, 1 / Years);
const impliedCAGR = impliedAnnualGrowth - 1;
console.log(`Implied CAGR: ${(impliedCAGR * 100).toFixed(5)}%`);
// Result ~ 9.918%

// 2. Check Loop Logic
// Maybe it's not starting from P?
// Maybe P is slightly different?

// 3. Check if Monthly Rate logic is weird.
// Logic: Rate = (1+CAGR)^(1/12) - 1
const cagr10 = 0.10;
const rate10 = Math.pow(1 + cagr10, 1 / 12) - 1;
const check10 = P * Math.pow(1 + rate10, Months);
console.log(`Expected (Strict 10%): ${check10.toLocaleString()}`);

// 4. What if Rate = 10% / 12 (Nominal)?
const rateNom = 0.10 / 12;
const checkNom = P * Math.pow(1 + rateNom, Months);
console.log(`Nominal 10% (Std Calc): ${checkNom.toLocaleString()}`);

// 5. What if Addition is NOT 0?
// Diff is ~400.
// If Addition was -X?
// Total Diff = FutureValue(Additions)
// T_Actual = T_Expected + FV(Additions)
// FV(Additions) = -409
// FV factor ~ 26 (approx 24 months + growth)
// Monthly Addition ~ -409 / 26 ~ -15.
// Is it possible the code thinks Addition is -15?
