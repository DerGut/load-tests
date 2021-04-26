
interface Classroom {
    prepared: boolean;
    name: string;
    teacher: Teacher;
    pupils: Pupil[];
}

interface Account {
    id(): string;
}

class Teacher implements Account {
    email: string;
    password: string;
    constructor(email: string, password: string) {
        this.email = email;
        this.password = password;
    }

    id() {
        return this.email;
    }
}

class Pupil implements Account {
    username: string;
    password: string;
    company: string;
    constructor(username: string, password: string, company: string) {
        this.username = username;
        this.password = password;
        this.company = company;
    }

    id() {
        return this.username;
    }
}
