/**
 * Token bucket for rate limiting.
 * Tokens refill at a constant rate up to capacity.
 * Operations consume tokens; if insufficient, they must wait.
 */
export class TokenBucket {
  private tokens: number
  private lastRefillTime: number
  private _refillRate: number // bytes per second (0 = unlimited)
  private _capacity: number

  /**
   * @param refillRate - Tokens added per second (0 = unlimited)
   * @param capacity - Maximum tokens (burst size). Defaults to 2 seconds worth.
   */
  constructor(refillRate: number = 0, capacity?: number) {
    this._refillRate = refillRate
    this._capacity = capacity ?? (refillRate > 0 ? refillRate * 2 : 0)
    this.tokens = this._capacity
    this.lastRefillTime = Date.now()
  }

  get refillRate(): number {
    return this._refillRate
  }

  get capacity(): number {
    return this._capacity
  }

  get available(): number {
    this.refill()
    return this.tokens
  }

  get isLimited(): boolean {
    return this._refillRate > 0
  }

  setLimit(bytesPerSec: number, burstSeconds: number = 2): void {
    this._refillRate = bytesPerSec
    this._capacity = bytesPerSec > 0 ? bytesPerSec * burstSeconds : 0
    if (this.tokens > this._capacity) {
      this.tokens = this._capacity
    }
  }

  tryConsume(tokens: number): boolean {
    if (!this.isLimited) return true

    this.refill()
    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }
    return false
  }

  msUntilAvailable(tokens: number): number {
    if (!this.isLimited) return 0

    this.refill()
    if (this.tokens >= tokens) return 0

    const needed = tokens - this.tokens
    return Math.ceil((needed / this._refillRate) * 1000)
  }

  private refill(): void {
    if (!this.isLimited) return

    const now = Date.now()
    const elapsed = now - this.lastRefillTime
    if (elapsed <= 0) return

    const tokensToAdd = (elapsed / 1000) * this._refillRate
    this.tokens = Math.min(this._capacity, this.tokens + tokensToAdd)
    this.lastRefillTime = now
  }
}
