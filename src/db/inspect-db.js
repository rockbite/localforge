// inspect_db.js
import { Level } from 'level';
import path from 'path';
import os from 'os';

// --- Configuration ---
// !! Adjust this to match your Store class !!
const projectName = 'localforge';
const dbPath = path.join(os.homedir(), `.${projectName}`, 'db');

// Get the key from command-line arguments, or set a default to list all
const keyToInspect = process.argv[2]; // e.g., run: node inspect_db.js session:sess_abc123:data
// --- End Configuration ---

let db;

async function inspectDb() {
    try {
        console.log(`Opening database at: ${dbPath}`);
        db = new Level(dbPath, { valueEncoding: 'json' }); // Use same encoding as your app
        await db.open();
        console.log('Database opened successfully.');

        if (keyToInspect) {
            console.log(`\nInspecting single key: ${keyToInspect}`);
            try {
                const value = await db.get(keyToInspect);
                console.log('Value:');
                console.log(JSON.stringify(value, null, 2)); // Pretty print JSON
            } catch (error) {
                if (error.code === 'LEVEL_NOT_FOUND') {
                    console.log(`Key "${keyToInspect}" not found.`);
                } else {
                    console.error(`Error getting key "${keyToInspect}":`, error);
                }
            }
        } else {
            console.log('\nListing all keys and values (limit 100):');
            let count = 0;
            for await (const [key, value] of db.iterator({ limit: 100 })) {
                console.log(`\nKey: ${key}`);
                try {
                    // Attempt to pretty-print if JSON, otherwise print as is
                    console.log(`Value: ${JSON.stringify(value, null, 2)}`);
                } catch {
                    console.log(`Value (raw): ${value}`);
                }
                count++;
                if (count >= 100) {
                    console.log('\n--- Reached limit of 100 entries ---');
                    break;
                }
            }
            if (count === 0) {
                console.log('Database appears to be empty or no keys found in iterator.');
            }
        }

    } catch (err) {
        console.error('Error inspecting database:', err);
    } finally {
        if (db && db.status === 'open') {
            await db.close();
            console.log('\nDatabase closed.');
        }
    }
}

await inspectDb();