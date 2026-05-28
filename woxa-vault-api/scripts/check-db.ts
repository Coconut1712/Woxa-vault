import { db, sql } from "../src/db/client";

async function checkTables() {
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    console.log("Existing tables in 'public' schema:");
    console.table(tables);
    
    // Specifically check for user_keys
    const userKeysExists = tables.some(t => t.table_name === 'user_keys');
    console.log(`Table 'user_keys' exists: ${userKeysExists}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Failed to check tables:", err);
    process.exit(1);
  }
}

checkTables();
