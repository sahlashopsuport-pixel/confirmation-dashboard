/**
 * Test script to check and debug sheet protection on the test spreadsheet.
 * Run: node test_protection.mjs
 */
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const SPREADSHEET_ID = '1RlgFNw5LSIVHN2JZdsqmHmSwCtVGMd643Qrg3RbIlcA';
const MANAGER_EMAILS = ['kada.hadjerkd@gmail.com', 'sahlashopsuport@gmail.com'];
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Missing service account credentials');
  return new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function main() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('=== Step 1: Check service account email ===');
  console.log('Service account:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

  console.log('\n=== Step 2: Get spreadsheet metadata ===');
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties,sheets.protectedRanges',
  });

  const allSheets = meta.data.sheets ?? [];
  console.log(`Found ${allSheets.length} tabs`);

  for (const sheet of allSheets) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    const ranges = sheet.protectedRanges ?? [];
    console.log(`\n  Tab: "${title}" (sheetId: ${sheetId})`);
    console.log(`  Existing protections: ${ranges.length}`);
    for (const p of ranges) {
      console.log(`    - ID: ${p.protectedRangeId}`);
      console.log(`      Description: ${p.description}`);
      console.log(`      Warning only: ${p.warningOnly}`);
      console.log(`      Range: ${JSON.stringify(p.range)}`);
      console.log(`      Editors: ${JSON.stringify(p.editors)}`);
      if (p.unprotectedRanges) {
        console.log(`      Unprotected ranges: ${p.unprotectedRanges.length}`);
        for (const ur of p.unprotectedRanges) {
          console.log(`        - ${JSON.stringify(ur)}`);
        }
      }
    }
  }

  console.log('\n=== Step 3: Remove all existing protections ===');
  const existingIds = [];
  for (const sheet of allSheets) {
    for (const p of (sheet.protectedRanges ?? [])) {
      if (p.protectedRangeId) existingIds.push(p.protectedRangeId);
    }
  }
  if (existingIds.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: existingIds.map(id => ({ deleteProtectedRange: { protectedRangeId: id } })),
      },
    });
    console.log(`Removed ${existingIds.length} existing protections`);
  } else {
    console.log('No existing protections to remove');
  }

  console.log('\n=== Step 4: Apply new whole-sheet protection ===');
  const EDITABLE_COLUMNS = [1, 2, 4, 6, 7, 8, 9, 10, 11]; // B, C, E, G, H, I, J, K, L
  const protectRequests = [];

  for (const sheet of allSheets) {
    const sheetId = sheet.properties?.sheetId ?? 0;
    const title = sheet.properties?.title ?? 'Unknown';
    const maxRow = sheet.properties?.gridProperties?.rowCount ?? 1000;

    // Build unprotected ranges for editable columns (row 2 to maxRow only)
    const unprotectedRanges = EDITABLE_COLUMNS.map(colIdx => ({
      sheetId,
      startRowIndex: 1,
      endRowIndex: maxRow,
      startColumnIndex: colIdx,
      endColumnIndex: colIdx + 1,
    }));

    protectRequests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            // No startRow/endRow/startCol/endCol = entire sheet
          },
          description: `Full sheet protection - ${title}`,
          warningOnly: false,
          editors: {
            users: [...MANAGER_EMAILS, SERVICE_ACCOUNT_EMAIL],
          },
          unprotectedRanges,
        },
      },
    });

    console.log(`  Prepared protection for "${title}" with ${unprotectedRanges.length} unprotected column ranges`);
  }

  try {
    const result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: protectRequests },
    });
    console.log(`\nProtection applied successfully!`);
    console.log(`Replies: ${result.data.replies?.length}`);
    
    // Print the protection IDs that were created
    for (const reply of (result.data.replies ?? [])) {
      if (reply.addProtectedRange) {
        const pr = reply.addProtectedRange.protectedRange;
        console.log(`  Created protection ID: ${pr?.protectedRangeId}`);
        console.log(`  Description: ${pr?.description}`);
        console.log(`  Editors: ${JSON.stringify(pr?.editors)}`);
      }
    }
  } catch (err) {
    console.error('FAILED to apply protection:', err.message);
    if (err.errors) console.error('Errors:', JSON.stringify(err.errors, null, 2));
  }

  console.log('\n=== Step 5: Verify protections ===');
  const verifyMeta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties,sheets.protectedRanges',
  });

  for (const sheet of (verifyMeta.data.sheets ?? [])) {
    const title = sheet.properties?.title;
    const ranges = sheet.protectedRanges ?? [];
    console.log(`\n  Tab: "${title}" — ${ranges.length} protection(s)`);
    for (const p of ranges) {
      console.log(`    ID: ${p.protectedRangeId}`);
      console.log(`    Warning only: ${p.warningOnly}`);
      console.log(`    Range: ${JSON.stringify(p.range)}`);
      console.log(`    Editors users: ${JSON.stringify(p.editors?.users)}`);
      console.log(`    Editors groups: ${JSON.stringify(p.editors?.groups)}`);
      console.log(`    Editors domainUsersCanEdit: ${p.editors?.domainUsersCanEdit}`);
      console.log(`    Unprotected ranges: ${p.unprotectedRanges?.length ?? 0}`);
    }
  }

  console.log('\n=== DONE ===');
  console.log('Now test: Open the sheet with a non-manager email and try to:');
  console.log('1. Delete a row → should be BLOCKED');
  console.log('2. Edit column B (Status) → should be ALLOWED');
  console.log('3. Edit column A (Date) → should be BLOCKED');
}

main().catch(console.error);
