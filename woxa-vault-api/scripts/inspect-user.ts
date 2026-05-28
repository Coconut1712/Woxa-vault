import { db, sql } from "../src/db/client";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function inspectUser() {
  try {
    const email = "developer@iux24.com";
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });
    
    if (user) {
      console.log(`User found: ${user.email}`);
      console.log(`ID: ${user.id}`);
      console.log(`Has passwordHash: ${!!user.passwordHash}`);
      console.log(`authKeyHash: ${user.authKeyHash?.substring(0, 15)}...`);
      console.log(`passwordUpdatedAt: ${user.passwordUpdatedAt}`);
    } else {
      console.log(`User ${email} not found`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Failed to inspect user:", err);
    process.exit(1);
  }
}

inspectUser();
