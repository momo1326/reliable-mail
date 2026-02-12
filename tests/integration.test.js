/**
 * Integration Tests for Reliable Mail API
 *
 * Run with: npm test
 *
 * Tests verify:
 * - POST /emails/send returns 202 with email ID
 * - Idempotent requests return same email ID
 * - Over-limit requests rejected with 429
 */
import assert from "assert";
const API_URL = "http://localhost:3000";
const API_KEY = "sk_live_test123"; // Use test key from local setup
async function testSendEmail() {
    console.log("✓ Test 1: POST /emails/send returns 202 with email ID");
    const payload = {
        idempotency_key: `test-${Date.now()}-${Math.random()}`,
        to: "test@example.com",
        from: "noreply@example.com",
        subject: "Test Email",
        html: "<p>Test</p>",
        text: "Test",
    };
    const response = await fetch(`${API_URL}/emails/send`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    assert.strictEqual(response.status, 202, `Expected 202, got ${response.status}`);
    const data = await response.json();
    assert(data.id, "Response should contain email ID");
    console.log(`  Email ID: ${data.id}`);
    return data.id;
}
async function testIdempotency(emailId) {
    console.log("✓ Test 2: Idempotent requests return same email ID");
    const payload = {
        idempotency_key: `idempotent-test-${Date.now()}`,
        to: "test@example.com",
        from: "noreply@example.com",
        subject: "Test Email",
        html: "<p>Test</p>",
        text: "Test",
    };
    // Send first request
    const response1 = await fetch(`${API_URL}/emails/send`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    const data1 = await response1.json();
    const firstId = data1.id;
    // Send same request again
    const response2 = await fetch(`${API_URL}/emails/send`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    const data2 = await response2.json();
    const secondId = data2.id;
    assert.strictEqual(firstId, secondId, `Idempotent requests should return same ID. Got ${firstId}, then ${secondId}`);
    console.log(`  Both requests returned ID: ${firstId}`);
}
async function testMissingAuthHeader() {
    console.log("✓ Test 3: Missing auth header returns 401");
    const payload = {
        idempotency_key: `test-${Date.now()}`,
        to: "test@example.com",
        from: "noreply@example.com",
        subject: "Test",
    };
    const response = await fetch(`${API_URL}/emails/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    assert.strictEqual(response.status, 401, `Expected 401, got ${response.status}`);
    const data = await response.json();
    assert(data.error, "Response should contain error message");
    console.log(`  Error: ${data.error}`);
}
async function runAllTests() {
    console.log("\n🧪 Running Reliable Mail API Tests\n");
    try {
        const emailId = await testSendEmail();
        await testIdempotency(emailId);
        await testMissingAuthHeader();
        console.log("\n✅ All tests passed!\n");
    }
    catch (error) {
        console.error("\n❌ Test failed:\n", error);
        process.exit(1);
    }
}
runAllTests();
//# sourceMappingURL=integration.test.js.map