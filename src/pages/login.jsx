export default function LoginScreen({db, setUserId}) {

    async function setUpUser() {
    
        const id = 'guest'; // placeholder - should be 'guest' if user chooses to continue as guest, else the ID from login authentication 
        const email = null; // placeholder - should only be null if guest
        const password = null;  // placeholder - should only be null if guest

        // If user doesn't exist (i.e. user id gives no primary key conflict), create record for it:
        await db.run(`
            INSERT INTO users (id, email, password)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING;
        `, [id, email, password]);
        
        setUserId(id);

    }

    return(
        <div className="login-container">
            <button onClick={setUpUser} style={{position: 'fixed', top: '100px'}}>Placeholder (continue as guest)</button>
        </div>
    );

}