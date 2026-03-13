/**
 * Test: Can the service account still write to a PROTECTED sheet?
 * This simulates what happens during lead assignment (appendRows) and
 * Apps Script collect/mark operations.
 */
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const SPREADSHEET_ID = '1RlgFNw5LSIVHN2JZdsqmHmSwCtVGMd643Qrg3RbIlcA';

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

  console.log('=== Test 1: Append a row (simulates lead assignment) ===');
  try {
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "'الأسبوع 1'!A:M",
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'OVERWRITE',
      requestBody: {
        values: [
          ['09/03/2026', '', '1', '', 'TEST WRITE', 'TEST-SKU', 'TEST PRODUCT', 'Test Client', '0555123456', 'Alger', 'Alger Centre', '3800', 'REF-TEST-001']
        ],
      },
    });
    console.log('SUCCESS: Row appended!');
    console.log('Updated range:', appendResult.data.updates?.updatedRange);
    console.log('Updated rows:', appendResult.data.updates?.updatedRows);
  } catch (err) {
    console.error('FAILED to append row:', err.message);
  }

  console.log('\n=== Test 2: Update a cell in protected column D (simulates collect/mark) ===');
  try {
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'الأسبوع 1'!D2",
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['نعم']],
      },
    });
    console.log('SUCCESS: Protected column D updated!');
    console.log('Updated range:', updateResult.data.updatedRange);
  } catch (err) {
    console.error('FAILED to update protected column D:', err.message);
  }

  console.log('\n=== Test 3: Update a cell in editable column B (simulates status change) ===');
  try {
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'الأسبوع 1'!B2",
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['تأكيد']],
      },
    });
    console.log('SUCCESS: Editable column B updated!');
    console.log('Updated range:', updateResult.data.updatedRange);
  } catch (err) {
    console.error('FAILED to update editable column B:', err.message);
  }

  console.log('\n=== Test 4: Delete a row (simulates what agents should NOT be able to do) ===');
  // Get the sheetId first
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const week1Sheet = meta.data.sheets?.find(s => s.properties?.title === 'الأسبوع 1');
  const sheetId = week1Sheet?.properties?.sheetId ?? 689278407;

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: 1,  // Row 2
              endIndex: 2,    // Just 1 row
            },
          },
        }],
      },
    });
    console.log('SUCCESS: Service account CAN delete rows (expected — it is an editor)');
  } catch (err) {
    console.error('FAILED: Service account CANNOT delete rows:', err.message);
  }

  console.log('\n=== All tests complete ===');
  console.log('If Tests 1-3 passed: Lead assignment and Apps Script operations will work fine with protection.');
  console.log('Test 4 should also pass because the service account is in the editors list.');
}

main().catch(console.error);
