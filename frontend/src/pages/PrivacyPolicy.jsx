import { HomeButton } from '../plan-buttons';

export default function PrivacyPolicy() {
    return (
        <div className="privacy-policy-container">
            <HomeButton />
            <p>
                The privacy policy will go here.
            </p>
            <p>
                Got questions? <a href="/contact">Get in touch</a>.
            </p>
        </div>
    );
}