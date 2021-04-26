
export interface Classroom {
    prepared: boolean;
    name: string;
    teacher: Teacher;
    pupils: Pupil[];
}

export interface Account {
    id(): string;
}

export class Teacher implements Account {
    email: string;
    password: string;
    constructor(json: {email: string, password: string}) {
        this.email = json.email;
        this.password = json.password;
    }

    id() {
        return this.email;
    }
}

export class Pupil implements Account {
    username: string;
    password: string;
    company: string;
    constructor(json: {username: string, password: string, company: string}) {
        this.username = json.username;
        this.password = json.password;
        this.company = json.company;
    }

    id() {
        return this.username;
    }
}
