import { useState } from "react";
import { Link } from "react-router-dom";
import MenuBar from "../MenuBar";

export default function Help() {

    return (
        <>
            <MenuBar />
            <div className="help-container">
                    
                <Tutorial />

                <p>If you have any questions, feel free to <Link to="/contact">get in touch</Link>.</p>

                <Link to="/"><img className="bottom-logo" src="/logo-text-beside.svg" /></Link>

                <p style={{fontSize: '0.8rem'}}>
                Example PDF plan used with thanks to <a href="https://commons.wikimedia.org/wiki/File:LEVEL_11_FLOOR_PLAN.pdf">Vivianwwj</a>
                , <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>, via Wikimedia Commons.
                </p>

            </div>
        </>
    )

}

function Tutorial() {

    const [step, setStep] = useState(1);

    const steps = [
        {
            heading: "Uploading PDF plan",
            explanation: null,
            src: "/tutorial/upload-pdf.mp4",
        },
        {
            heading: "Adding items to plan",
            explanation: "Tap anywhere on the plan to add an item marker, or tap on an existing marker to edit its information. The 'severity' field is used to priority-rank items in the generated report's summary statistics (see later step).",
            src: "/tutorial/add-item.mp4",
        },
        {
            heading: "Attaching image to item",
            explanation: "When adding or editing an item, tap 'Add image' to attach an image. You can attach multiple images to the same item.",
            src: "/tutorial/add-image.mp4",
        },
        {
            heading: "Managing categories and assigning one to item",
            explanation: "When adding or editing an item, tap 'Manage' in the 'Category' field. Here, you can add, edit or delete categories, and define a marker colour to represent each category. When finished with managing categories, choose the desired category from the drop down to assign it to the item.",
            src: "/tutorial/categories.mp4",
        },
        {
            heading: "Generating report",
            explanation: <>
                <p>
                    When all items have been added, tap 'Generate report'. The report will show some summary statistics, followed by a full breakdown of each item, with its marked location and attached images. Please note: 
                </p> 
                <ul className="bullets">
                    <li>Report generation wait time is skipped in this video.</li>
                    <li>The generated report should be opened in the Microsoft Word mobile app or desktop app for proper formatting.</li>
                </ul>
            </>,
            src: "/tutorial/generate-report.mp4",
        },
        {
            heading: "Synchronising with planpin.app website",
            explanation: "You may access and edit your plans on the web at planpin.app. Any changes you make on the web will only be reflected on the app (and vice versa) after you press 'Sync'. Note, sync is automatically carried out on first-time log in and on report generation.",
            src: "/tutorial/sync.jpeg",
        },
    ]

    const heading = steps[step - 1].heading;
    const explanation = steps[step - 1].explanation;
    const src = steps[step - 1].src;

    const numSteps = steps.length;

    return <TutorialContent step={step} setStep={setStep} numSteps={numSteps} heading={heading} explanation={explanation} src={src} />

}

function TutorialContent({ step, setStep, numSteps, heading, explanation, src }) {
    
    const isVideo = src.endsWith('.mp4') ? true : false;
    
    return (
        <div>
            
            <h2>
                {/*str(step) + ': ' + */heading} {/* I have commented out the step number, as it's not necessarily an order that must be followed */}
            </h2>

            {typeof explanation === "string" ? (
                <p>{explanation}</p>
            ) : (
                explanation
            )}

            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                <LeftButton step={step} setStep={setStep} numSteps={numSteps} />
                { isVideo ?
                    <video key={src} style={{height: '50vh'}} controls preload="metadata" poster={src.replace(/\.mp4$/, ".PNG")}> {/* key makes React re-render when src changes */}
                        <source src={src} type="video/mp4" />
                    </video>
                :
                    <img key={src} src={src} style={{height: '50vh'}} />
                }
                <RightButton step={step} setStep={setStep} numSteps={numSteps} />
            </div>

        </div>
    )
}

function LeftButton({ step, setStep, numSteps }) {

    function handleClick() {
        setStep(prevStep => {
            if (prevStep !== 1) {
                return prevStep - 1;
            }
        })
    }

    return (
        <img className="tutorial-button" src="/tutorial/chevron-left.svg" style={{visibility: step === 1 ? 'hidden' : undefined}} onClick={handleClick} />
    )

}

function RightButton({ step, setStep, numSteps }) {

    function handleClick() {
        setStep(prevStep => {
            if (prevStep !== numSteps) {
                return prevStep + 1;
            }
        })
    }

    return (
        <img className="tutorial-button" src="/tutorial/chevron-right.svg" style={{visibility: step === numSteps ? 'hidden' : undefined}} onClick={handleClick} />
    )

}