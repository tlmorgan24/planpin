import { Link } from "react-router-dom";
import MenuBar from "../MenuBar";

export default function PrivacyPolicy() {
    return (
        <>
            <MenuBar />
            <div className="privacy-policy-container">

                <h1>Privacy policy</h1>

                <div className="privacy-policy">

                    <h2>Information collected</h2>
                    <p>The following types of information may be collected through use of the PlanPin iOS app or the planpin.app website:</p>
                    <ul>
                        <li><strong>Account Information:</strong> Email address</li>
                        <li><strong>Project Data:</strong> Uploaded PDFs, images, and item descriptions</li>
                        <li><strong>Technical Data:</strong> Timestamps for creation, update and synchronisation of the above data.</li>
                    </ul>
                    <p>Passwords used to sign up or log in are securely encrypted and not visible to PlanPin. Subscription transactions are handled by Apple, and financial details do not pass through PlanPin.</p>

                    <h2>Use of information</h2>
                    <p>Collected information is used solely to:</p>
                    <ul>
                        <li>Provide core functionality, including uploading images, adding item descriptions, and generating reports</li>
                        <li>Manage account access and authentication</li>
                        <li>Enable cloud backup and synchronisation.</li>
                    </ul>
                    <p>Personal information is not sold or used for marketing purposes.</p>

                    <h2>Data storage and security</h2>
                    <p>Data is stored locally on the user's device when using the PlanPin iOS app. Data is stored in the cloud when using the planpin.app website, or when sync is triggered by the user on the PlanPin iOS app (manually, on initial sign in, and on report generation). Security measures include:</p>
                    <ul>
                        <li>Authentication controls on both the PlanPin iOS app and the planpin.app website</li>
                        <li>Row-level security policies restricting cloud data access to only the authenticated owning user</li>
                        <li>Regular monitoring and security best practices.</li>
                    </ul>

                    <h2>Data sharing</h2>
                    <p>Data is not shared with any third parties except to provide cloud database hosting, under strict data handling agreements.</p>

                    <h2>User rights</h2>
                    <p>Users have the right to:</p>
                    <ul>
                        <li>Access and review personal data</li>
                        <li>Correct or delete data</li>
                        <li>Delete their account and all associated data immediately at any time, through the app or website</li>
                    </ul>

                    <h2>Children's privacy</h2>
                    <p>PlanPin is not intended for children under the age of 13. No information is knowingly collected from users in this age group.</p>

                    <h2>Changes to this privacy policy</h2>
                    <p>This policy may be updated over time. In the case of significant changes, notice will be provided through the app or email.</p>

                    <h2>Contact</h2>
                    <p>In the case of any questions regarding this policy, users are welcome to use the <Link to="/contact">contact form</Link> or email <a href="mailto:contact@planpin.app">contact@planpin.app</a>.</p>

                </div>

                <Link to="/"><img className="bottom-logo" src="/logo-text-beside.svg" /></Link>
                
            </div>
        </>
    );
}