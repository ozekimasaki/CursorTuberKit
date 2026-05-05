# Abort Listener Cleanup Analysis

## cursorAgent.ts Lines 87-89

```typescript
} finally {
  signal.removeEventListener("abort", handleAbort)  // Line 88
}
```

## Question: Is the listener removed before or after agent cleanup?

Looking at the full structure:

```typescript
try {
  const run = await agent.send(buildAvatarPrompt(prompt))
  // ... cancelRun setup ...
  
  try {
    signal.addEventListener("abort", handleAbort, { once: true })  // INNER try
    // ... main streaming logic ...
  } finally {
    signal.removeEventListener("abort", handleAbort)  // INNER finally (line 88)
  }
} finally {
  if (typeof agent[Symbol.asyncDispose] === "function") {  // OUTER finally (line 91-95)
    await agent[Symbol.asyncDispose]()
  } else {
    agent.close()
  }
}
```

**Execution order on abort:**
1. handleAbort fires → calls `void cancelRun()`
2. If in streaming loop, breaks out
3. Inner finally block runs → removeEventListener
4. Outer finally block runs → dispose/close agent

**Potential Issue**: 
- handleAbort calls `void cancelRun()` (non-blocking)
- The cancelRun promise is running asynchronously
- Agent gets disposed before cancelRun completes

**Is this a problem?**
- Depends on whether run.cancel() requires the agent to still be alive
- If agent.close() invalidates the run object, run.cancel() might fail silently
- The .catch(() => undefined) in cancelRun would swallow any error

**Race scenario:**
1. Abort signal fires
2. handleAbort calls `void cancelRun()` - starts promise but doesn't wait
3. Stream loop exits immediately
4. Inner finally: removes listener
5. Outer finally: closes agent  ← might happen before cancelRun completes
6. cancelRun promise tries to call run.cancel() on disposed agent
7. Error swallowed by .catch(() => undefined)

**Verdict**: Possible resource leak if run.cancel() needs to complete before agent disposal.

**Better pattern would be:**
```typescript
try {
  signal.addEventListener("abort", handleAbort, { once: true })
  // ... streaming ...
  
  // On normal completion, explicitly cancel if aborted
  if (signal.aborted) {
    await cancelRun()  // Wait for cancel to complete
  }
} finally {
  signal.removeEventListener("abort", handleAbort)
  // Ensure any pending cancel completes before disposal
  if (cancelPromise) {
    await cancelPromise
  }
}
```

But wait - looking at the actual code again, lines 52-55 and 58-61 DO await cancelRun().
The issue is only if abort happens AFTER the stream completes but before agent disposal.

Actually, reviewing the flow:
- Line 86: `await cancelRun()` - this is the defensive cleanup
- This happens BEFORE the finally block that closes the agent
- So cancellation should complete before disposal

**Re-analysis**: Actually safer than I thought. Line 86 is reachable when:
- Stream completes normally
- Line 74 check: signal.aborted = true
- Line 86: await cancelRun() ensures cancel completes
- Then outer finally disposes agent

The only concern is handleAbort firing during the finally block itself.
