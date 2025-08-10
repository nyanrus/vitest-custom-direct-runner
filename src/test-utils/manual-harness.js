console.log('[Manual Harness] Loaded. Defining describe(), it(), and expect().');

const testResults = [];
let currentSuite = '';

// Check if the Vite client is available
if (!window.__VITE_CLIENT__) {
  console.error(
    '[Manual Harness] Vite client not found. Make sure you are running in a Vite dev server environment.'
  );
}

function reportResult(result) {
  if (window.__VITE_CLIENT__) {
    window.__VITE_CLIENT__.send('manual-test:result', result);
  }
  // Also log to the browser console for immediate feedback
  if (result.pass) {
    console.log(`%c  ✓ ${result.name}`, 'color: green;');
  } else {
    console.error(`%c  ✗ ${result.name}`, 'color: red;');
    console.error(result.error);
  }
}

// Simple implementation of describe, it, expect
window.describe = (name, fn) => {
  console.log(`%cRunning suite: ${name}`, 'color: blue; font-weight: bold;');
  currentSuite = name;
  fn();
  currentSuite = '';
};

window.it = async (name, fn) => {
  const testName = `${currentSuite}: ${name}`;
  try {
    await fn();
    reportResult({ pass: true, name: testName });
  } catch (e) {
    reportResult({ pass: false, name: testName, error: e.message, stack: e.stack });
  }
};

window.expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
    }
  },
  // Add more matchers as needed
});
