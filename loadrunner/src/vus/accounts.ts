
interface Classroom {
    prepared: boolean;
    name: string;
    teacher: Teacher;
    pupils: Pupil[];
}

interface Teacher {
    email: string;
    password: string;
}

interface Pupil {
    username: string;
    password: string;
    companyName: string;
}
