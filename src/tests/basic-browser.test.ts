// describe, it, expect are now globals provided by manual-harness.js

describe('브라우저 기본 기능 테스트', () => {
  it('DOM 조작이 정상 작동해야 함', async () => {
    const div = document.createElement('div');
    div.textContent = '테스트';
    document.body.appendChild(div);
    const result = document.querySelector('div')?.textContent;

    expect(result).toBe('테스트');

    // cleanup
    div.remove();
  });

  it('Fetch API를 사용할 수 있어야 함', async () => {
    const hasApiSupport = typeof fetch !== 'undefined';
    expect(hasApiSupport).toBeTruthy();
  });
});
