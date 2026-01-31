import { isIpInAllowlist, parseAllowlistString, validateAllowlist } from '../ipAllowlist'

describe('ipAllowlist', () => {
  describe('isIpInAllowlist', () => {
    describe('empty allowlist', () => {
      it('should return true for any IP when allowlist is empty', () => {
        expect(isIpInAllowlist('192.168.1.1', [])).toBe(true)
        expect(isIpInAllowlist('10.0.0.1', [])).toBe(true)
        expect(isIpInAllowlist('::1', [])).toBe(true)
      })
    })

    describe('single IP matching', () => {
      it('should match exact IPv4 address', () => {
        const allowlist = ['192.168.1.100']
        expect(isIpInAllowlist('192.168.1.100', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.1.101', allowlist)).toBe(false)
      })

      it('should match exact IPv6 address', () => {
        const allowlist = ['2001:db8::1']
        expect(isIpInAllowlist('2001:db8::1', allowlist)).toBe(true)
        expect(isIpInAllowlist('2001:db8::2', allowlist)).toBe(false)
      })

      it('should match multiple IPs in allowlist', () => {
        const allowlist = ['192.168.1.1', '10.0.0.1', '172.16.0.1']
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.0.0.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('172.16.0.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('8.8.8.8', allowlist)).toBe(false)
      })
    })

    describe('CIDR matching', () => {
      it('should match IPv4 in /24 range', () => {
        const allowlist = ['192.168.1.0/24']
        expect(isIpInAllowlist('192.168.1.0', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.1.255', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.2.1', allowlist)).toBe(false)
      })

      it('should match IPv4 in /16 range', () => {
        const allowlist = ['10.0.0.0/16']
        expect(isIpInAllowlist('10.0.0.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.0.255.255', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.1.0.1', allowlist)).toBe(false)
      })

      it('should match IPv4 in /8 range', () => {
        const allowlist = ['10.0.0.0/8']
        expect(isIpInAllowlist('10.0.0.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.255.255.255', allowlist)).toBe(true)
        expect(isIpInAllowlist('11.0.0.1', allowlist)).toBe(false)
      })

      it('should match IPv6 CIDR ranges', () => {
        const allowlist = ['2001:db8::/32']
        expect(isIpInAllowlist('2001:db8::1', allowlist)).toBe(true)
        expect(isIpInAllowlist('2001:db8:ffff::1', allowlist)).toBe(true)
        expect(isIpInAllowlist('2001:db9::1', allowlist)).toBe(false)
      })
    })

    describe('edge cases', () => {
      it('should handle /32 (single host)', () => {
        const allowlist = ['192.168.1.1/32']
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.1.2', allowlist)).toBe(false)
      })

      it('should handle /0 (all IPs)', () => {
        const allowlist = ['0.0.0.0/0']
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.0.0.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('255.255.255.255', allowlist)).toBe(true)
      })

      it('should handle invalid IP addresses', () => {
        const allowlist = ['192.168.1.0/24']
        expect(isIpInAllowlist('invalid', allowlist)).toBe(false)
        expect(isIpInAllowlist('', allowlist)).toBe(false)
        expect(isIpInAllowlist('999.999.999.999', allowlist)).toBe(false)
      })

      it('should skip invalid allowlist entries', () => {
        const allowlist = ['192.168.1.1', 'invalid', '10.0.0.1']
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.0.0.1', allowlist)).toBe(true)
      })

      it('should handle IPv4-mapped IPv6 addresses', () => {
        const allowlist = ['192.168.1.1']
        // ::ffff:192.168.1.1 is the IPv4-mapped form
        expect(isIpInAllowlist('::ffff:192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('::ffff:192.168.1.2', allowlist)).toBe(false)
      })
    })

    describe('mixed allowlist', () => {
      it('should match with mixed single IPs and CIDR ranges', () => {
        const allowlist = [
          '8.8.8.8',           // Single IP
          '192.168.0.0/16',    // Private range
          '10.0.0.0/8',        // Another private range
        ]
        expect(isIpInAllowlist('8.8.8.8', allowlist)).toBe(true)
        expect(isIpInAllowlist('192.168.1.1', allowlist)).toBe(true)
        expect(isIpInAllowlist('10.255.255.255', allowlist)).toBe(true)
        expect(isIpInAllowlist('172.16.0.1', allowlist)).toBe(false)
      })
    })
  })

  describe('parseAllowlistString', () => {
    it('should return empty array for undefined', () => {
      expect(parseAllowlistString(undefined)).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(parseAllowlistString('')).toEqual([])
    })

    it('should parse single IP', () => {
      expect(parseAllowlistString('192.168.1.1')).toEqual(['192.168.1.1'])
    })

    it('should parse comma-separated IPs', () => {
      expect(parseAllowlistString('192.168.1.1,10.0.0.1')).toEqual(['192.168.1.1', '10.0.0.1'])
    })

    it('should trim whitespace', () => {
      expect(parseAllowlistString('  192.168.1.1 , 10.0.0.1  ')).toEqual(['192.168.1.1', '10.0.0.1'])
    })

    it('should filter empty entries', () => {
      expect(parseAllowlistString('192.168.1.1,,10.0.0.1,')).toEqual(['192.168.1.1', '10.0.0.1'])
    })

    it('should parse CIDR ranges', () => {
      expect(parseAllowlistString('192.168.0.0/16, 10.0.0.0/8')).toEqual(['192.168.0.0/16', '10.0.0.0/8'])
    })
  })

  describe('validateAllowlist', () => {
    it('should return empty array for valid entries', () => {
      expect(validateAllowlist(['192.168.1.1', '10.0.0.0/8', '2001:db8::1'])).toEqual([])
    })

    it('should return invalid entries', () => {
      expect(validateAllowlist(['192.168.1.1', 'invalid', '10.0.0.0/8'])).toEqual(['invalid'])
    })

    it('should return multiple invalid entries', () => {
      expect(validateAllowlist(['bad1', '192.168.1.1', 'bad2'])).toEqual(['bad1', 'bad2'])
    })

    it('should catch invalid CIDR ranges', () => {
      expect(validateAllowlist(['192.168.1.1/33'])).toEqual(['192.168.1.1/33'])
    })

    it('should return empty array for empty input', () => {
      expect(validateAllowlist([])).toEqual([])
    })
  })
})
