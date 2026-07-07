import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const pageShellState = readFileSync("src/components/page-shell-state.tsx", "utf8");

test("page shell state only synchronizes shell context and never renders a fallback shell frame", () => {
  assert.match(appShell, /const AppShellContext = createContext<AppShellContextValue \| null>\(null\);/);
  assert.doesNotMatch(appShell, /useLayoutEffect/);
  assert.doesNotMatch(pageShellState, /<AppShell/);
  assert.match(pageShellState, /useContext\(AppShellContext\)/);
  assert.doesNotMatch(pageShellState, /useLayoutEffect/);
  assert.doesNotMatch(pageShellState, /\[currentPath, headerUser, isDemo, shellContext, title\]/);
  assert.match(pageShellState, /const setShellState = shellContext\?\.setShellState;/);
  assert.match(pageShellState, /\[currentPath, headerUser, isDemo, setShellState, title\]/);
  assert.match(pageShellState, /useEffect\(\(\) => {/);
  assert.match(pageShellState, /return null;/);
});

test("app shell context value is stable and same shell state updates are ignored", () => {
  assert.match(appShell, /import \{[\s\S]*useCallback,[\s\S]*useMemo,/);
  assert.match(appShell, /function isSameShellState/);
  assert.match(appShell, /const updateShellState = useCallback/);
  assert.match(appShell, /return isSameShellState\(current, nextState\) \? current : nextState;/);
  assert.match(appShell, /const shellContextValue = useMemo\(\(\) => \(\{ setShellState: updateShellState \}\), \[updateShellState\]\);/);
  assert.doesNotMatch(appShell, /<AppShellContext\.Provider value=\{\{ setShellState \}\}>/);
});
