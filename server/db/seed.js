import { clients, projects, timesheets, settings } from './index.js';

async function seed() {
  // Clear existing data
  await clients.remove({}, { multi: true });
  await projects.remove({}, { multi: true });
  await timesheets.remove({}, { multi: true });
  await settings.remove({}, { multi: true });

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

  console.log('Seed complete!');
  console.log(`Created: 2 clients, 3 projects, ${5 + 3} timesheet entries`);
}

seed().catch(console.error);
