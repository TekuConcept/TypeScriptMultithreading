
export default function main(data?: { offset?: number }) {
    // Simulate some heavy computation
    let sum = 0
    for (let i = 0; i < 10; i++)
        sum += i
    return sum + (data?.offset || 0)
}
