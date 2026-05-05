# Abort Handling Analysis

## cursorAgent.ts Critical Path

### Lines 35-43: cancelRun deduping
```typescript
const run = await agent.send(buildAvatarPrompt(prompt))
let cancelPromise: Promise<void> | null = null

const cancelRun = () => {
  if (!cancelPromise) {
    cancelPromise = run.cancel().catch(() => undefined)
  }
  return cancelPromise
}
```

**Issue Check**: Is there a race between checking `!cancelPromise` and setting it?
- No. JavaScript is single-threaded. The check + assignment is atomic.
- Multiple calls will correctly dedupe to the first promise.

### Lines 45-47: handleAbort
```typescript
const handleAbort = () => {
  void cancelRun()
}
```

**Issue Check**: Why `void` instead of `await`?
- Event listeners cannot be async
- Using `void` to explicitly discard promise (correct pattern)
- The cancelRun() promise runs independently

### Lines 50-89: Main flow with race conditions

```typescript
try {
  signal.addEventListener("abort", handleAbort, { once: true })
  
  if (signal.aborted) {  // Line 52-55
    await cancelRun()
    return
  }
  
  for await (const event of run.stream()) {  // Line 57
    if (signal.aborted) {  // Line 58-61
      await cancelRun()
      return
    }
    // process event
  }
  
  if (!signal.aborted) {  // Line 74-84
    try {
      await run.wait()
    } catch (error) {
      if (!signal.aborted) {
        throw error
      }
    }
    return
  }
  
  await cancelRun()  // Line 86
} finally {
  signal.removeEventListener("abort", handleAbort)  // Line 88
}
```

**Race Condition Analysis**:

1. **Race between line 50 and 52**:
   - Line 50: addEventListener("abort", handleAbort)
   - Line 52: if (signal.aborted)
   - **POTENTIAL RACE**: If abort happens between these two lines:
     - handleAbort is registered (line 50)
     - Signal is already aborted, so handleAbort won't fire
     - Line 52 check catches it → await cancelRun() → OK
   - **VERDICT**: Safe

2. **Race in loop (line 58)**:
   - Checks `if (signal.aborted)` before processing
   - If abort happens during processing, worst case: one extra event processed
   - **VERDICT**: Safe (minor inefficiency, not a bug)

3. **Race at line 74 (after loop completes)**:
   - Loop completed normally
   - Check `if (!signal.aborted)` → call run.wait()
   - **POTENTIAL RACE**: Abort could happen between check and run.wait()
   - Line 77-80 catches errors if aborted: `if (!signal.aborted) throw error`
   - **VERDICT**: Safe (error swallowed if aborted)

4. **Line 86 (unreachable code?)**:
   ```typescript
   if (!signal.aborted) {
     // ...
     return  // Line 83
   }
   
   await cancelRun()  // Line 86 - when is this reached?
   ```
   - Line 74-83: if NOT aborted → return
   - Line 86: await cancelRun()
   - **WHEN REACHED?**: Only if line 74 check fails (signal.aborted = true)
   - But if aborted, loop should have caught it at line 58-61
   - **POTENTIAL ISSUE**: This might be dead code OR handles edge case where:
     - Loop completes
     - Signal is aborted before line 74 check
   - **VERDICT**: Defensive programming, probably safe but unusual

### Lines 90-96: Cleanup
```typescript
finally {
  if (typeof agent[Symbol.asyncDispose] === "function") {
    await agent[Symbol.asyncDispose]()
  } else {
    agent.close()
  }
}
```

**Issue Check**: 
- Checks for Symbol.asyncDispose support
- Falls back to close()
- **QUESTION**: What if agent.close() doesn't exist?
- **VERDICT**: Assumes close() exists as fallback (no null check)

## server/index.ts Error Extraction

### Lines 199-221: extractErrorMessage recursion

```typescript
function extractErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const message = value.trim()
    if (!message) return null
    
    const parsedJson = parseJsonMessage(message)
    return extractErrorMessage(parsedJson) ?? message  // RECURSIVE
  }
  
  if (value instanceof Error) {
    return extractErrorMessage(value.message) ?? value.name  // RECURSIVE
  }
  
  if (!isRecord(value)) return null
  
  return extractErrorMessage(value.message) ?? 
         extractErrorMessage(value.error) ?? 
         extractErrorMessage(value.details)  // RECURSIVE
}
```

**Issue Check - Infinite Recursion**:

Scenario 1: Self-referencing object
```javascript
const obj = { message: null }
obj.message = obj
extractErrorMessage(obj) 
// → extractErrorMessage(obj.message) 
// → extractErrorMessage(obj) 
// → INFINITE LOOP
```

Scenario 2: Circular reference
```javascript
const a = { message: null }
const b = { message: a }
a.message = b
extractErrorMessage(a)
// → extractErrorMessage(a.message) = extractErrorMessage(b)
// → extractErrorMessage(b.message) = extractErrorMessage(a)
// → INFINITE LOOP
```

Scenario 3: String that parses to itself (unlikely but possible)
```javascript
const jsonStr = '{"message": "{\\"message\\": \\"...\\"}"}'
// Keeps parsing nested JSON strings
```

**VERDICT**: **CRITICAL BUG** - No recursion depth limit or cycle detection

