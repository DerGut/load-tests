import EventEmitter from "events";

const ClassCreated = "classCreated";

export default class ClassLog extends EventEmitter {
    constructor(classSize: number) {
        super();
        super.setMaxListeners(classSize);
    }

    addClass(joinCode: string) {
        super.emit(ClassCreated, joinCode);
    }

    onClassCreated(cb: (joinCode: string) => void) {
        super.on(ClassCreated, cb);
    }
}
