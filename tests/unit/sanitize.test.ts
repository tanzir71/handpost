import { describe, expect, it } from 'vitest';
import { sanitizeDom } from '../../src/main/engine/sanitize';
describe('fixture sanitization', () => {
  it('removes scripts, tokens and sensitive meta', () => {
    const clean = sanitizeDom(
      '<meta name="csrf-token" content="secret"><input value="secret"><script>localStorage.token="x"</script><p>safe</p>',
    );
    expect(clean).not.toMatch(/secret|script|csrf|localStorage/);
    expect(clean).toContain('<p>safe</p>');
  });
});
