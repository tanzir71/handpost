import { openDatabase } from '../src/main/db/database';
import { Repositories } from '../src/main/db/repositories';
import { PLATFORM_IDS } from '../src/shared/types';
const db=openDatabase(process.argv[2]??'handpost.db');const repo=new Repositories(db);for(const platform of PLATFORM_IDS){try{repo.accounts.create({platform,displayName:platform,profileDir:`profiles/${platform}`});}catch(error){if(!(error instanceof Error&&error.message.includes('UNIQUE')))throw error;}}console.log(`Seeded ${repo.accounts.list().length} accounts`);db.close();
