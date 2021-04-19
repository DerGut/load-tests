import EventEmitter from "events";

const ClassCreated = "classCreated";

export default class ClassLog extends EventEmitter {
    constructor(classSize: number) {
        super();
        super.setMaxListeners(classSize);
    }

    addClass(classCode: string) {
        super.emit(ClassCreated, classCode);
    }

    onClassCreated(cb: (classCode: string) => void) {
        super.on(ClassCreated, cb);
    }
}
