export async function f2(roomcodeHashmap: Map<number, string>) {
    console.log("called f2 function");

    console.log("the result:", roomcodeHashmap);
    
    roomcodeHashmap.forEach((value,key) => {
        console.log("key:",key);
        console.log("value:",value);
    });
     
    }