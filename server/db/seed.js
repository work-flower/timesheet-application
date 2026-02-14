import { clients, projects, timesheets, settings, expenses, invoices, transactions, importJobs, stagedTransactions } from './index.js';
import aiConfig from './aiConfig.js';

async function seed() {
  // Clear existing data
  await clients.remove({}, { multi: true });
  await projects.remove({}, { multi: true });
  await timesheets.remove({}, { multi: true });
  await settings.remove({}, { multi: true });
  await expenses.remove({}, { multi: true });
  await invoices.remove({}, { multi: true });
  await transactions.remove({}, { multi: true });
  await importJobs.remove({}, { multi: true });
  await stagedTransactions.remove({}, { multi: true });
  await aiConfig.remove({}, { multi: true });

  // Seed business client (created before settings so we can reference its ID)
  const businessClient = await clients.insert({
    companyName: 'Smith Consulting Ltd',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
    defaultRate: 0,
    currency: 'GBP',
    workingHoursPerDay: 8,
    invoicingEntityName: '',
    invoicingEntityAddress: '123 High Street, London, EC1A 1BB',
    isBusiness: true,
    isLocked: true,
    isLockedReason: 'Business Client — managed via Settings',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Default project for business client
  await projects.insert({
    clientId: businessClient._id,
    endClientId: null,
    name: 'Default Project',
    ir35Status: 'OUTSIDE_IR35',
    rate: null,
    workingHoursPerDay: null,
    vatPercent: 20,
    isDefault: true,
    status: 'active',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed settings
  await settings.insert({
    name: 'John Smith',
    email: 'john@example.com',
    phone: '07700 900123',
    address: '123 High Street, London, EC1A 1BB',
    businessName: 'Smith Consulting Ltd',
    utrNumber: '1234567890',
    vatNumber: 'GB123456789',
    companyRegistration: '12345678',
    invoiceNumberSeed: 0,
    defaultPaymentTermDays: 10,
    defaultVatRate: 20,
    invoiceFooterText: '',
    bankName: 'Barclays',
    bankSortCode: '20-00-00',
    bankAccountNumber: '12345678',
    bankAccountOwner: 'Smith Consulting Ltd',
    businessClientId: businessClient._id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed clients
  const client1 = await clients.insert({
    companyName: 'Barclays Bank',
    primaryContactName: 'Jane Doe',
    primaryContactEmail: 'jane.doe@barclays.com',
    primaryContactPhone: '020 7116 1234',
    defaultRate: 650,
    currency: 'GBP',
    workingHoursPerDay: 8,
    invoicingEntityName: 'Barclays Bank UK PLC',
    invoicingEntityAddress: '1 Churchill Place\nCanary Wharf\nLondon E14 5HP',
    notes: 'Main banking client',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const client2 = await clients.insert({
    companyName: 'HMRC Digital',
    primaryContactName: 'Bob Wilson',
    primaryContactEmail: 'bob.wilson@hmrc.gov.uk',
    primaryContactPhone: '0300 200 3300',
    defaultRate: 600,
    currency: 'GBP',
    workingHoursPerDay: 7.5,
    invoicingEntityName: 'HMRC Digital',
    invoicingEntityAddress: '100 Parliament Street\nLondon SW1A 2BQ',
    notes: 'Government contract via agency',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed projects
  const proj1 = await projects.insert({
    clientId: client1._id,
    endClientId: null,
    name: 'Default Project',
    ir35Status: 'OUTSIDE_IR35',
    rate: null,
    workingHoursPerDay: null,
    vatPercent: 20,
    isDefault: true,
    status: 'active',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const proj2 = await projects.insert({
    clientId: client1._id,
    endClientId: null,
    name: 'Payment Platform Migration',
    ir35Status: 'OUTSIDE_IR35',
    rate: 700,
    workingHoursPerDay: null,
    vatPercent: 20,
    isDefault: false,
    status: 'active',
    notes: 'Migrating legacy payment system to microservices',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const proj3 = await projects.insert({
    clientId: client2._id,
    endClientId: null,
    name: 'Default Project',
    ir35Status: 'INSIDE_IR35',
    rate: null,
    workingHoursPerDay: null,
    vatPercent: null,
    isDefault: true,
    status: 'active',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed timesheets (this week)
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    if (d <= today) {
      await timesheets.insert({
        projectId: proj2._id,
        date: dateStr,
        hours: 8,
        days: 1,
        amount: 700,
        notes: `Day ${i + 1} work on payment migration`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // A couple entries for HMRC
  const lastWeekMon = new Date(monday);
  lastWeekMon.setDate(monday.getDate() - 7);
  for (let i = 0; i < 3; i++) {
    const d = new Date(lastWeekMon);
    d.setDate(lastWeekMon.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    await timesheets.insert({
      projectId: proj3._id,
      date: dateStr,
      hours: 7.5,
      days: 1,
      amount: 600,
      notes: `HMRC digital services work`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Seed expenses
  const now = new Date().toISOString();
  const travelExpense = await expenses.insert({
    projectId: proj2._id,
    date: monday.toISOString().split('T')[0],
    expenseType: 'Travel',
    description: 'Train to Canary Wharf office',
    amount: 45.60,
    vatAmount: 0,
    vatPercent: 0,
    billable: true,
    currency: 'GBP',
    attachments: [],
    notes: 'Return ticket Kings Cross to Canary Wharf',
    createdAt: now,
    updatedAt: now,
  });

  await expenses.insert({
    projectId: proj2._id,
    date: monday.toISOString().split('T')[0],
    expenseType: 'Mileage',
    description: 'Drive to data centre',
    amount: 32.40,
    vatAmount: 0,
    vatPercent: 0,
    billable: true,
    currency: 'GBP',
    attachments: [],
    notes: '72 miles at 45p/mile',
    createdAt: now,
    updatedAt: now,
  });

  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  if (tuesday <= today) {
    await expenses.insert({
      projectId: proj2._id,
      date: tuesday.toISOString().split('T')[0],
      expenseType: 'Equipment',
      description: 'USB-C adapter for meeting room',
      amount: 24.99,
      vatAmount: 4.17,
      vatPercent: 16.69,
      billable: false,
      currency: 'GBP',
      attachments: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  await expenses.insert({
    projectId: proj3._id,
    date: lastWeekMon.toISOString().split('T')[0],
    expenseType: 'Travel',
    description: 'Train to HMRC Croydon office',
    amount: 28.50,
    vatAmount: 0,
    vatPercent: 0,
    billable: true,
    currency: 'GBP',
    attachments: [],
    notes: 'Off-peak return',
    createdAt: now,
    updatedAt: now,
  });

  // Seed sample invoices — draft invoice for Barclays with empty lines
  const draftInvoice = await invoices.insert({
    clientId: client1._id,
    status: 'draft',
    invoiceNumber: null,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    servicePeriodStart: monday.toISOString().split('T')[0],
    servicePeriodEnd: new Date(monday.getTime() + 4 * 86400000).toISOString().split('T')[0],
    additionalNotes: '',
    lines: [],
    paymentStatus: 'unpaid',
    paidDate: null,
    subtotal: 0,
    totalVat: 0,
    total: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Seed AI config
  await aiConfig.insert({
    apiKey: '',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: null,
    timeoutMinutes: null,
    systemPrompt: 'You are a bank statement parser. The attached file is a bank statement export which may be in CSV, OFX, PDF or other formats. Extract all transactions and return a JSON array. Each transaction must have: `date` (YYYY-MM-DD), `description` (string), `amount` (number, negative for debits, positive for credits). Include any other fields present such as `balance`, `reference`, `transactionType`, etc. Return ONLY the JSON array, no other text.',
    createdAt: now,
    updatedAt: now,
  });

  // Seed import job (ready_for_review)
  const importJob = await importJobs.insert({
    filename: 'natwest-jan-2026.csv',
    filePath: '',
    status: 'ready_for_review',
    error: null,
    userPrompt: 'Parse the attached bank statement.',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });

  // Seed transactions linked to import job
  await transactions.insert({
    accountName: 'NatWest Business Current',
    date: monday.toISOString().split('T')[0],
    description: 'BARCLAYS BANK PLC - PAYMENT RECEIVED',
    amount: 3500,
    balance: 15230.50,
    importJobId: importJob._id,
    source: { date: monday.toISOString().split('T')[0], description: 'BARCLAYS BANK PLC - PAYMENT RECEIVED', amount: 3500, balance: 15230.50, type: 'credit' },
    status: 'matched',
    ignoreReason: null,
    invoiceId: draftInvoice._id,
    expenseId: null,
    clientId: client1._id,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  });

  await transactions.insert({
    accountName: 'NatWest Business Current',
    date: monday.toISOString().split('T')[0],
    description: 'TFL TRAVEL - CONTACTLESS',
    amount: -45.60,
    balance: 11730.50,
    importJobId: importJob._id,
    source: { date: monday.toISOString().split('T')[0], description: 'TFL TRAVEL - CONTACTLESS', amount: -45.60, balance: 11730.50, type: 'debit' },
    status: 'matched',
    ignoreReason: null,
    invoiceId: null,
    expenseId: travelExpense._id,
    clientId: client1._id,
    projectId: proj2._id,
    createdAt: now,
    updatedAt: now,
  });

  await transactions.insert({
    accountName: 'NatWest Business Current',
    date: lastWeekMon.toISOString().split('T')[0],
    description: 'GITHUB INC - SUBSCRIPTION',
    amount: -29.99,
    balance: 11700.51,
    importJobId: importJob._id,
    source: { date: lastWeekMon.toISOString().split('T')[0], description: 'GITHUB INC - SUBSCRIPTION', amount: -29.99, balance: 11700.51, type: 'debit' },
    status: 'unmatched',
    ignoreReason: null,
    invoiceId: null,
    expenseId: null,
    clientId: null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  });

  await transactions.insert({
    accountName: 'NatWest Business Current',
    date: lastWeekMon.toISOString().split('T')[0],
    description: 'NATWEST - MONTHLY ACCOUNT FEE',
    amount: -15.00,
    balance: 11685.51,
    importJobId: importJob._id,
    source: { date: lastWeekMon.toISOString().split('T')[0], description: 'NATWEST - MONTHLY ACCOUNT FEE', amount: -15.00, balance: 11685.51, type: 'debit' },
    status: 'ignored',
    ignoreReason: 'Bank fee — not a business expense',
    invoiceId: null,
    expenseId: null,
    clientId: null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  });

  console.log('Seed complete!');
  console.log(`Created: 3 clients, 4 projects, ${5 + 3} timesheet entries, 4 expenses, 1 invoice, 1 import job, 4 transactions, 1 AI config`);
}

seed().catch(console.error);
