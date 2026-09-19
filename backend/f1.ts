export var hashmap = new Map<string, string[]>()

export async function f1(roomcode: any, name: any) {
    const room = await roomcode;
    const user = await name;
    console.log(room, user + " this pring from my side")
    if (hashmap.has(roomcode)) {
        hashmap.get(roomcode)!.push(user)
        console.log("room already exist")
    }
    else {
        hashmap.set(roomcode, [user])
        console.log("room created successfully")
    }
    console.log(hashmap)
}
