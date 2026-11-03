
function parseSafeFloat(val) {
    if (val === undefined || val === null || val === "") return 0;
    const str = val.toString().replace(/,/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

const testCases = [
    { input: "2,500", expected: 2500 },
    { input: "1,000", expected: 1000 },
    { input: "500", expected: 500 },
    { input: "1,234.56", expected: 1234.56 },
    { input: 2500, expected: 2500 },
    { input: "", expected: 0 },
    { input: null, expected: 0 },
    { input: undefined, expected: 0 },
    { input: "abc", expected: 0 }
];

testCases.forEach(tc => {
    const result = parseSafeFloat(tc.input);
    if (result === tc.expected) {
        console.log(`PASS: input="${tc.input}" -> result=${result}`);
    } else {
        console.error(`FAIL: input="${tc.input}" -> result=${result}, expected=${tc.expected}`);
    }
});
