console.log('Manual test file loaded!');

function assertEquals(a, b, message) {
  if (a !== b) {
    throw new Error(`Assertion Failed: ${message || ''}. Expected "${a}" to equal "${b}".`);
  }
  console.log(`%cAssertion Passed: ${message || ''}`, 'color: green;');
}

try {
  console.log('Running manual tests...');

  const div = document.createElement('div');
  div.id = 'manual-test-div';
  div.textContent = 'Hello from manual test!';
  document.body.appendChild(div);

  const text = document.getElementById('manual-test-div').textContent;
  assertEquals(text, 'Hello from manual test!', 'DOM manipulation test');

  console.log('%cAll manual tests passed!', 'color: green; font-weight: bold;');
} catch (e) {
  console.error('%cManual test failed!', 'color: red; font-weight: bold;');
  console.error(e);
}
