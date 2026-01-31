/**
 * Admin Events Authentication Test
 * Validates that internal events endpoints properly require admin authentication
 */

import jwt from 'jsonwebtoken';
import { AdminClaims } from '../middleware/adminAuthentication';

/**
 * Test admin JWT token generation
 * This would typically be done by the admin authentication service
 */
export function generateTestAdminJWT(): string {
  if (!process.env.ADMIN_JWT_SECRET) {
    throw new Error('ADMIN_JWT_SECRET environment variable required for testing');
  }

  const adminClaims: AdminClaims = {
    sub: 'test-admin-123',
    userId: 'test-admin-123',
    email: 'admin@sheenapps.com',
    role: 'admin',
    is_admin: true,
    admin_permissions: ['internal.events.read'],
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(adminClaims, process.env.ADMIN_JWT_SECRET, {
    algorithm: 'HS256',
    issuer: 'sheen-admin',
    audience: 'sheen-admin-panel'
  });
}

/**
 * Test cases for admin authentication validation
 */
export const adminAuthTestCases = [
  {
    name: 'Valid admin JWT should allow access',
    setup: () => ({
      headers: {
        'Authorization': `Bearer ${generateTestAdminJWT()}`,
        'x-correlation-id': 'test-auth-001'
      }
    }),
    expectedStatus: 200
  },
  {
    name: 'Missing authorization header should return 401',
    setup: () => ({
      headers: {
        'x-correlation-id': 'test-auth-002'
      }
    }),
    expectedStatus: 401
  },
  {
    name: 'Invalid JWT should return 401',
    setup: () => ({
      headers: {
        'Authorization': 'Bearer invalid.jwt.token',
        'x-correlation-id': 'test-auth-003'
      }
    }),
    expectedStatus: 401
  },
  {
    name: 'JWT without internal.events.read permission should return 403',
    setup: () => {
      const claims: AdminClaims = {
        sub: 'test-admin-456',
        userId: 'test-admin-456',
        email: 'limited-admin@sheenapps.com',
        role: 'admin',
        is_admin: true,
        admin_permissions: ['users.read'], // Wrong permission
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        iat: Math.floor(Date.now() / 1000)
      };

      const token = jwt.sign(claims, process.env.ADMIN_JWT_SECRET!, {
        algorithm: 'HS256',
        issuer: 'sheen-admin',
        audience: 'sheen-admin-panel'
      });

      return {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-correlation-id': 'test-auth-004'
        }
      };
    },
    expectedStatus: 403
  }
];

/**
 * Manual test runner for admin authentication
 * Run with: ts-node src/test/adminEventsAuthTest.ts
 */
if (require.main === module) {
  console.log('Admin Events Authentication Test');
  console.log('=================================');

  try {
    const testToken = generateTestAdminJWT();
    console.log('✅ Test JWT generation successful');
    console.log('Token length:', testToken.length);

    // Verify the token can be decoded
    const decoded = jwt.verify(testToken, process.env.ADMIN_JWT_SECRET!) as AdminClaims;
    console.log('✅ JWT verification successful');
    console.log('Admin email:', decoded.email);
    console.log('Permissions:', decoded.admin_permissions);

    console.log('\nTest cases prepared:');
    adminAuthTestCases.forEach((testCase, index) => {
      console.log(`  ${index + 1}. ${testCase.name} (expect ${testCase.expectedStatus})`);
    });

    console.log('\nTo test the endpoints:');
    console.log('1. Start the server: npm run dev');
    console.log(`2. Test valid auth: curl -H "Authorization: Bearer ${testToken}" http://localhost:3000/internal/builds/test-123/events`);
    console.log('3. Test invalid auth: curl http://localhost:3000/internal/builds/test-123/events');

  } catch (error) {
    console.error('❌ Test preparation failed:', error);
    process.exit(1);
  }
}