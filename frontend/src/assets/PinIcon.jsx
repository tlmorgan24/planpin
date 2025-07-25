// This SVG code is copied from pin.svg, but with fill color turned into a variable

export default function PinIcon({fillColor, className, id, style, onClick}) {

    return (
    <svg className={className} id={id} style={style} onClick={onClick} width="14" height="19" viewBox="0 0 14 19" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 18.5C7 18.5 1 11.5 1 7C1 3.68629 3.68629 1 7 1C10.3137 1 13 3.68629 13 7C13 11.5 7 18.5 7 18.5Z" fill={fillColor} stroke="#6B6B6B" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 9.5C8.38071 9.5 9.5 8.38071 9.5 7C9.5 5.61929 8.38071 4.5 7 4.5C5.61929 4.5 4.5 5.61929 4.5 7C4.5 8.38071 5.61929 9.5 7 9.5Z" fill="#6B6B6B"/>
    </svg>
    )

}

