import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

interface User {
    id: string;
    username: string;
    passwordHash: string;
    createdAt: string;
    totalKills: number;
    totalDeaths: number;
    totalDamage: number;
    gamesPlayed: number;
}

interface UserData {
    users: User[];
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    const initialData: UserData = { users: [] };
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialData, null, 2));
}

function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function loadUsers(): UserData {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading users:', error);
        return { users: [] };
    }
}

function saveUsers(data: UserData): void {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving users:', error);
    }
}

export class AuthService {
    static register(username: string, password: string): { success: boolean; message: string; userId?: string } {
        const data = loadUsers();
        
        // Check if username already exists
        const existingUser = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (existingUser) {
            return { success: false, message: 'Username already exists' };
        }
        
        // Validate username
        if (username.length < 3 || username.length > 20) {
            return { success: false, message: 'Username must be 3-20 characters' };
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { success: false, message: 'Username can only contain letters, numbers, and underscores' };
        }
        
        // Validate password
        if (password.length < 4) {
            return { success: false, message: 'Password must be at least 4 characters' };
        }
        
        // Create new user
        const newUser: User = {
            id: crypto.randomUUID(),
            username,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            totalKills: 0,
            totalDeaths: 0,
            totalDamage: 0,
            gamesPlayed: 0
        };
        
        data.users.push(newUser);
        saveUsers(data);
        
        return { success: true, message: 'Registration successful', userId: newUser.id };
    }
    
    static login(username: string, password: string): { success: boolean; message: string; userId?: string; username?: string } {
        const data = loadUsers();
        
        const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) {
            return { success: false, message: 'Invalid username or password' };
        }
        
        const passwordHash = hashPassword(password);
        if (user.passwordHash !== passwordHash) {
            return { success: false, message: 'Invalid username or password' };
        }
        
        return { success: true, message: 'Login successful', userId: user.id, username: user.username };
    }
    
    static updateStats(userId: string, stats: { kills?: number; deaths?: number; damage?: number }): void {
        const data = loadUsers();
        const user = data.users.find(u => u.id === userId);
        
        if (user) {
            if (stats.kills !== undefined) user.totalKills += stats.kills;
            if (stats.deaths !== undefined) user.totalDeaths += stats.deaths;
            if (stats.damage !== undefined) user.totalDamage += stats.damage;
            user.gamesPlayed += 1;
            
            saveUsers(data);
        }
    }
    
    static getUser(userId: string): User | null {
        const data = loadUsers();
        return data.users.find(u => u.id === userId) || null;
    }
    
    static getAllUsers(): User[] {
        const data = loadUsers();
        return data.users;
    }
}
