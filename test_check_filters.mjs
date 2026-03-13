import 'dotenv/config';
import { google } from 'googleapis';

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Check one of the Algeria agents — let's use Soheib's sheet
// First, let's get the agent sheets from the database
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const conn = await mysql.createConnection(dbUrl);

const [rows] = await conn.execute(
  "SELECT id, name, sheetUrl FROM agent_sheets WHERE country = 'algeria' LIMIT 3"
);

console.log('=== Checking filter views on real agent sheets ===\n');

for (const row of rows) {
  const match = row.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    console.log(`${row.name}: Invalid URL`);
    continue;
  }
  const spreadsheetId = match[1];
  
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties,sheets.filterViews,sheets.protectedRanges',
    });
    
    const allSheets = meta.data.sheets ?? [];
    console.log(`--- ${row.name} (${spreadsheetId.slice(0, 10)}...) ---`);
    
    let totalProtections = 0;
    let totalFilterViews = 0;
    
    for (const sheet of allSheets) {
      const title = sheet.properties?.title ?? 'Unknown';
      const protections = sheet.protectedRanges?.length ?? 0;
      const filterViews = sheet.filterViews?.length ?? 0;
      totalProtections += protections;
      totalFilterViews += filterViews;
      
      if (protections > 0 || filterViews > 0) {
        console.log(`  Tab "${title}": ${protections} protections, ${filterViews} filter views`);
        if (filterViews > 0) {
          for (const fv of sheet.filterViews) {
            console.log(`    Filter: "${fv.title}" (ID: ${fv.filterViewId})`);
          }
        }
      }
    }
    
    console.log(`  TOTAL: ${totalProtections} protections, ${totalFilterViews} filter views\n`);
  } catch (err) {
    console.log(`${row.name}: ERROR — ${err.message}\n`);
  }
}

await conn.end();
