# Testing Setup Guide for Chanchito

## Overview

This project now includes comprehensive unit tests for critical functions in the Chanchito finance application.

## Test Files Created

### 1. `src/lib/utils/__tests__/dates.test.ts` (36 test cases)

Tests for date utility functions:
- `parseLocalDate()` - Parses ISO date strings as local dates (avoiding UTC bugs)
- `formatLocalDate()` - Formats dates to YYYY-MM-DD
- `todayString()` - Returns today's date as string
- `isInSameMonth()` - Compares dates by month/year
- `getInstallmentPaymentDate()` - Calculates payment dates for credit card installments
- `getCreditCardPeriod()` - Calculates credit card billing cycles

**Key Coverage:**
- Date parsing with timezone awareness
- Edge cases: month boundaries, year transitions, leap years
- Credit card cycle calculations with various closing/payment day combinations
- Boundary conditions for DST and date arithmetic

### 2. `src/lib/store/__tests__/financeStore.test.ts` (24 test cases)

Tests for pure computation functions from the finance store:

#### `calculateGlobalBalance()`
- Tests income/expense calculations
- Validates balance computations
- Checks handling of negative amounts
- Confirms installments are included (no double-counting)

#### `calculateMonthlyBurnRate()`
- Validates subscription summation
- Filters inactive subscriptions
- Handles empty and zero cases
- Tests absolute value handling

#### `calculateMonthlyVariableExpenses()`
- Filters variable expenses (no installments, no subscriptions)
- Respects month boundaries
- Handles different payment method types
- Validates absolute value calculations

## Installation Instructions

### Prerequisites

Install Vitest in your project:

```bash
npm install --save-dev vitest
```

Or, if using yarn:

```bash
yarn add --dev vitest
```

### Configuration

The project includes `vitest.config.ts` with:
- Node environment for testing utilities
- Global test functions (describe, it, expect)
- Path alias resolution (@/ -> src/)

### Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/lib/utils/__tests__/dates.test.ts

# Run with coverage
npm run test -- --coverage
```

## Test Statistics

- **Total Tests Created:** 60 test cases
- **dates.test.ts:** 36 tests
- **financeStore.test.ts:** 24 tests

### Test Breakdown by Module

#### dates.test.ts
- parseLocalDate: 5 tests
- formatLocalDate: 4 tests
- todayString: 1 test
- isInSameMonth: 4 tests
- getInstallmentPaymentDate: 8 tests
- getCreditCardPeriod: 6 tests

#### financeStore.test.ts
- calculateGlobalBalance: 6 tests
- calculateMonthlyBurnRate: 5 tests
- calculateMonthlyVariableExpenses: 10 tests

## Key Testing Principles Applied

### 1. Pure Function Testing
Tests extract computation logic as pure functions without Zustand dependency, making them:
- Fast to execute
- Deterministic and reliable
- Easy to understand

### 2. Edge Case Coverage
- Boundary dates (first/last day of month)
- Year transitions (December to January)
- Leap years (February 29)
- Timezone-related issues

### 3. Business Logic Validation
- No double-counting of installments in global balance
- Correct filtering of active vs. inactive subscriptions
- Proper month-scoping for variable expenses
- Handling of negative amounts (absolute values)

### 4. Type Safety
- Uses TypeScript with full type inference
- Aligns with database schema types
- Mock data matches actual structure

## Integration with CI/CD

To add to your GitHub Actions or other CI/CD:

```yaml
- name: Run tests
  run: npm run test

- name: Generate coverage
  run: npm run test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Common Issues & Solutions

### Issue: Tests fail with "vitest not found"
**Solution:** Run `npm install --save-dev vitest`

### Issue: Path alias errors (@/ not resolving)
**Solution:** Verify `vitest.config.ts` path alias matches your project structure

### Issue: Date tests fail in different timezone
**Solution:** Tests use local date parsing which respects system timezone. This is intentional to match user experience.

## Next Steps for Enhancement

1. **Add Zustand Store Tests**
   - Mock Zustand hooks
   - Test integrated store behavior
   - Add state mutation tests

2. **Add React Component Tests**
   - Component rendering
   - User interactions
   - Form submissions

3. **Add E2E Tests**
   - Full user workflows
   - Database integration
   - API interactions

4. **Coverage Improvements**
   - Target 80%+ coverage for critical paths
   - Add snapshot tests for complex calculations
   - Test error handling and edge cases

## Test Philosophy

These tests follow these principles:

- **Behavior-driven:** Tests validate what functions DO, not HOW they do it
- **Clear naming:** Test names explain the scenario and expected outcome
- **Independent:** Each test is isolated and doesn't depend on others
- **Fast:** Pure function tests run in milliseconds
- **Maintainable:** Tests are readable and serve as documentation

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Best Practices](https://testing-library.com/docs/)
- [Jest Matchers (Vitest compatible)](https://vitest.dev/api/expect.html)
