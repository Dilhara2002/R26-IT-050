import { useEffect, useState } from 'react';
import $ from 'jquery';

import IconButton from './IconButton';

import './AdaptiveTable.css';

/**
 * @description AdaptiveTable is a component that displays data in a table format. 
 * The table can be toggled to show or hide the data and can be paginated.
 *  
 * @param {String} tableId - unique id for the table
 * @param {String} title - title of the table
 * @param {String} subtitle - subtitle of the table
 * @param {Object[]} headers - headers of the table. Should be an array of `objects` with the following properties: 
 * ```
 * {
 *      colKey: string // key to access the data in the data array
 *      icon: string // icon to display before the label. should be a google material 
 *      iconlabel: string // label to display as the header
 * }
 * ```
 * @param {object[]} data - data to display in the table. Should be an array of `objects` containing the keys specified in the headers
 * @param {Number} pagination - number of items to display per page
 * @param {React.Component} filters - filters to display above the table. Should be a `React` component
 * @param {Number} filterWidth - width of the filter container
 * @param {Function} onAddBtnClick - function to call when the add button is clicked
 * @param {Function} onReportBtnClick - function to call when the report button is clicked
 * @returns
 */
function AdaptiveTable({ tableId, title, subtitle, headers, data, pagination = 5, filters, filterWidth, onAddBtnClick, onReportBtnClick }) {

    const [view, setView] = useState(true)
    const [page, setPage] = useState(1)

    const [startIndex, setStartIndex] = useState(0)
    const [endIndex, setEndIndex] = useState(pagination)

    useEffect(() => {
        setStartIndex((page - 1) * pagination);
        setEndIndex(page * pagination);
    }, [page, pagination])

    const toggle = () => {
        $(`#${tableId}__table-container`).slideToggle(500);
        setView(!view)
    }

    filterWidth = filterWidth || "400";

    return (
        <div className={`adaptive-table-container`} id={tableId}>
            <div className={`adaptive-table__title ${view ? "" : "hidden"}`}>
                <span className="adaptive-table__title-container">
                    <span className="adaptive-table__title-text">{title}</span>
                    {subtitle && <span className="adaptive-table__subtitle">{subtitle}</span>}
                </span>
                
                {
                    filters && <div className="adaptive-table__fiter-container" style={{ "width": `${filterWidth}px` }}>
                        {filters}
                    </div>
                }
                <div className="horizontal-container">
                    <IconButton onClick={onReportBtnClick} iconb={"file_save"} h={30} c="blue" content={"Export"}/>
                    <IconButton onClick={onAddBtnClick} iconb={"add"} h={30} bg="green" c="white" content={"Add"}/>
                    <div></div>
                    {
                        view ? <IconButton onClick={toggle} size={30} icona={"keyboard_arrow_down"} /> : <IconButton size={30} onClick={toggle} icona={"keyboard_arrow_up"} />
                    }
                </div>
            </div>
            <div id={`${tableId}__table-container`}>
                <div className='adaptive-table__table-container'>
                    <table className="adaptive-table" id={`${tableId}__table`}>
                        <thead className="adaptive-table__header">
                            <tr className='adaptive-table__row'>
                                {
                                    headers.map((col, index) => (
                                        <td className="adaptive-table__col" key={index}>
                                            <span className="adaptive-table-header-col">
                                                {col.icon && <span className='material-symbols-outlined adaptive-table__header-icon'>{col.icon}</span>}
                                                {col.label}
                                            </span>

                                        </td>
                                    ))
                                }
                            </tr>
                        </thead>
                        <tbody className="adaptive-table__body">
                            {
                                data.slice(startIndex, endIndex).map((row, index) => (
                                    <tr className="adaptive-table__row" key={index}>
                                        {headers.map((col, colIndex) => (
                                            <td className="adaptive-table__col" key={`${col.colKey}-${colIndex}`}>
                                                {row[col.colKey] || ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
                <div className="adaptive-table__footer">
                    <span>
                        {
                            Array.from({ length: Math.ceil(data.length / pagination) }, (_, index) => (
                                <IconButton extraClass={`adaptive-table__page-btn ${page === index + 1 ? "active" : ""}`} key={index} onClick={() => setPage(index + 1)} content={index + 1} w="40" lm="5" />
                            ))
                        }
                    </span>
                    <span>
                        <IconButton c="white" bg="blue" />
                    </span>
                </div>
            </div>
        </div>
    )
}

export default AdaptiveTable;