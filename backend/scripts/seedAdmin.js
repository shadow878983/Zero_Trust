const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { StringDecoder } = require('node:string_decoder');
const User = require('../src/models/User');
require('dotenv').config();

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Run this command in an interactive terminal so the password can be entered privately.'));
      return;
    }

    stdout.write(prompt);
    const decoder = new StringDecoder('utf8');
    let value = '';

    const finish = (error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003') {
          finish(new Error('Admin setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') value += character;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from backend/.env.');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await User.init();

  if (await User.exists({ role: 'Admin' })) {
    throw new Error('An Admin account already exists. Admin setup is one-time only.');
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  let name;
  let email;
  try {
    name = (await terminal.question('Admin name: ')).trim();
    email = (await terminal.question('Admin email: ')).trim().toLowerCase();
  } finally {
    terminal.close();
  }

  if (name.length < 2 || name.length > 80) {
    throw new Error('Name must be between 2 and 80 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  if (await User.exists({ email })) {
    throw new Error('That email already belongs to an account. Choose another email.');
  }

  const password = await askHidden('Admin password (at least 12 characters): ');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must be at least 12 characters and no more than 72 bytes.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name,
    email,
    passwordHash,
    role: 'Admin',
    department: 'Unassigned',
    isActive: true,
  });

  console.log(`Admin account created for ${email}. You can now sign in through POST /api/auth/login.`);
}

main()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
