import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { HomeButton } from '../plan-buttons';

export default function Contact() {

    const textAreaRef = useRef(null); // HTML textarea element used for message (we have to useRef to enable auto-resizing as part of handleTextAreaChange below)
    // Form values:
    const [formValues, setFormValues] = useState({name: '', email: '', message: ''});

    // When user presses submit, send to back end to handle forwarding message to me as an email:
    async function handleSubmit(e) {
        
        e.preventDefault();

        toast.loading('Sending message...', {id: 'loading'});

        const serverIp = import.meta.env.VITE_SERVER_IP_ADDRESS;
        const serverPort = import.meta.env.VITE_SERVER_PORT;

        try {

            const response = await fetch(`http://${serverIp}:${serverPort}/forward_message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formValues),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            toast.success('Message sent!', {id: 'loading'});

            setFormValues({name: '', email: '', message: ''});

        } catch (error) {
            toast.error('There was a problem sending the message', {id: 'loading'});
            console.error("Error sending message: ", error);
        }

    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    // Have to manually resize text area to enable dynamic size change based on length of user input:
    function handleTextAreaChange(event) {
        if (textAreaRef.current) {
            // Assuming 2.5rem is the desired minimum height of textarea (at time of writing, this matches the height of the normal input elements)
            textAreaRef.current.style.height = '2.5rem';
            textAreaRef.current.style.height = `max(${textAreaRef.current.scrollHeight}px, 2.5rem)`; // Adjust height to content
            }
        handleFormChange(event);
    }

    return (
        <div className="contact-container">

            <form onSubmit={handleSubmit}>

                <h1>Send a message</h1>

                {/* Name: */}
                <div className="form-item">
                    <label htmlFor="name">Name</label>
                    <input id="name" name="name" type="text" value={formValues.name} onChange={handleFormChange} />
                </div>

                {/* Email: */}
                <div className="form-item">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={formValues.email} onChange={handleFormChange} />
                </div>

                {/* Message: */}
                <div className="form-item">
                    <label htmlFor="message">Message</label>
                    <textarea ref={textAreaRef} id="message" name="message" value={formValues.message} onChange={handleTextAreaChange} />
                </div>

                <p>Alternatively, send an email to <a href="mailto:contact@planpin.app">contact@planpin.app</a>.</p>

                <div className="big-buttons-container">
                    <HomeButton />
                    <button type="submit" className="accented">Submit</button>
                </div>

            </form>

            <a href="/"><img className="bottom-logo" src="/src/assets/logo-text-beside.svg" /></a>

        </div>
    );

}