# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-spike.spec.ts >> capture screenshots of P0 spike
- Location: test-spike.spec.ts:4:5

# Error details

```
Error: page.evaluate: TypeError: Cannot convert undefined or null to object
    at Object.keys (<anonymous>)
    at eval (eval at evaluate (:370:30), <anonymous>:2:19)
    at UtilityScript.evaluate (<anonymous>:372:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - button "Reset" [ref=e3]
  - button "upper_front_outer" [ref=e4]
  - button "upper_right_outer" [ref=e5]
  - button "upper_left_outer" [ref=e6]
  - button "lower_front_outer" [ref=e7]
  - button "lower_right_outer" [ref=e8]
  - button "lower_left_outer" [ref=e9]
  - button "upper_front_inner" [ref=e10]
  - button "upper_right_inner" [ref=e11]
  - button "upper_left_inner" [ref=e12]
  - button "lower_front_inner" [ref=e13]
  - button "lower_right_inner" [ref=e14]
  - button "lower_left_inner" [ref=e15]
```