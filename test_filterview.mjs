/**
 * Test script: Create a Filter View on the protected test sheet
 * so agents can filter data without needing edit access to protected columns.
 * Run: node test_filterview.mjs
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

  // Step 1: Get spreadsheet metadata
  console.log('=== Step 1: Get spreadsheet metadata ===');
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties,sheets.filterViews',
  });

  const allSheets = meta.data.sheets ?? [];
  console.log(`Found ${allSheets.length} tabs`);

  // Step 2: Check existing filter views
  console.log('\n=== Step 2: Check existing filter views ===');
  const existingFilterViewIds = [];
  for (const sheet of allSheets) {
    const title = sheet.properties?.title;
    const filterViews = sheet.filterViews ?? [];
    console.log(`  Tab: "${title}" — ${filterViews.length} filter view(s)`);
    for (const fv of filterViews) {
      console.log(`    - ID: ${fv.filterViewId}, Title: "${fv.title}"`);
      console.log(`      Range: ${JSON.stringify(fv.range)}`);
      existingFilterViewIds.push(fv.filterViewId);
    }
  }

  // Step 3: Remove existing filter views (clean slate)
  if (existingFilterViewIds.length > 0) {
    console.log(`\n=== Step 3: Removing ${existingFilterViewIds.length} existing filter views ===`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: existingFilterViewIds.map(id => ({
          deleteFilterView: { filterId: id },
        })),
      },
    });
    console.log('Removed all existing filter views');
  } else {
    console.log('\n=== Step 3: No existing filter views to remove ===');
  }

  // Step 4: Create a filter view for each tab (one at a time to handle errors gracefully)
  console.log('\n=== Step 4: Creating filter views (one per tab) ===');
  // Skip tabs that might have tables or are non-data tabs
  const SKIP_TABS = ['PERFORMANCE', 'PRIX LIVRAISON SUD', 'الدليل'];

  for (const sheet of allSheets) {
    const sheetId = sheet.properties?.sheetId ?? 0;
    const title = sheet.properties?.title ?? 'Unknown';
    const maxRow = sheet.properties?.gridProperties?.rowCount ?? 1000;
    // Use 13 columns (A-M) for agent data tabs to avoid table intersections
    const maxCol = 13;

    if (SKIP_TABS.includes(title)) {
      console.log(`  Skipping "${title}" (non-data tab)`);
      continue;
    }

    try {
      const result = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addFilterView: {
              filter: {
                title: `Filter - ${title}`,
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: maxRow,
                  startColumnIndex: 0,
                  endColumnIndex: maxCol,
                },
              },
            },
          }],
        },
      });

      const fv = result.data.replies?.[0]?.addFilterView?.filter;
      const fvId = fv?.filterViewId;
      console.log(`  Created filter view for "${title}" (ID: ${fvId})`);
      console.log(`  URL: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${sheetId}&fvid=${fvId}`);
    } catch (err) {
      console.error(`  FAILED for "${title}": ${err.message}`);
    }
  }

  // Step 5: Verify
  console.log('\n=== Step 5: Verify filter views ===');
  const verifyMeta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties,sheets.filterViews',
  });

  for (const sheet of (verifyMeta.data.sheets ?? [])) {
    const title = sheet.properties?.title;
    const filterViews = sheet.filterViews ?? [];
    console.log(`  Tab: "${title}" — ${filterViews.length} filter view(s)`);
    for (const fv of filterViews) {
      console.log(`    - "${fv.title}" (ID: ${fv.filterViewId})`);
    }
  }

  console.log('\n=== DONE ===');
  console.log('Now test: Open the filter view URL with a non-manager email.');
  console.log('The filter should be active — click dropdown arrows on column headers to filter.');
}

main().catch(console.error);
