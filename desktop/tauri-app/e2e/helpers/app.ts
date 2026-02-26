/**
 * Page object helpers for driving the 200 OK desktop UI.
 *
 * Uses React-compatible input setting via native value setter + input event.
 */

async function setReactInputValue(
  testId: string,
  value: string,
): Promise<void> {
  await browser.execute(
    (tid: string, val: string) => {
      const el = document.querySelector(
        `[data-testid="${tid}"]`,
      ) as HTMLInputElement;
      if (!el) throw new Error(`[data-testid="${tid}"] not found`);
      // Use the native setter to bypass React's synthetic event system
      const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      );
      if (!descriptor?.set)
        throw new Error("Cannot find HTMLInputElement value setter");
      const setter = descriptor.set;
      // Reset React's value tracker so it detects the change
      // biome-ignore lint/suspicious/noExplicitAny: React internal property
      const tracker = (el as Record<string, any>)._valueTracker;
      if (tracker) tracker.setValue("");
      setter.call(el, val);
      // React 18 listens for the native 'input' event via delegation
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    testId,
    value,
  );
}

export async function setDirectory(dir: string): Promise<void> {
  await setReactInputValue("dir-input", dir);
}

export async function setPort(port: number): Promise<void> {
  await setReactInputValue("port-input", String(port));
}

export async function clickStart(): Promise<void> {
  const btn = await $('[data-testid="start-btn"]');
  await btn.click();
}

export async function clickStop(): Promise<void> {
  const btn = await $('[data-testid="stop-btn"]');
  await btn.click();
}

export async function waitForServerUrl(timeout = 15000): Promise<string> {
  const link = await $('[data-testid="server-url"]');
  await link.waitForDisplayed({ timeout });
  return link.getText();
}

export async function getError(): Promise<string | null> {
  const el = await $('[data-testid="error-msg"]');
  if (await el.isExisting()) {
    return el.getText();
  }
  return null;
}

export async function isServerUrlVisible(): Promise<boolean> {
  const link = await $('[data-testid="server-url"]');
  return link.isExisting();
}
