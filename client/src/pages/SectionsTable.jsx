import { useSections } from '../hooks/useSections.js'

const cellStyle = {
  border: '1px solid #ccc',
  padding: '8px',
  textAlign: 'left',
}

const thStyle = {
  ...cellStyle,
  backgroundColor: '#f5f5f5',
  fontWeight: 600,
}

export default function SectionsTable() {
  const { data, loading, error } = useSections()

  if (loading) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
        Loading sections…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          color: '#b91c1c',
          fontFamily: 'system-ui, sans-serif',
        }}
        role="alert"
      >
        {error}
      </div>
    )
  }

  const sections = data?.sections
  if (!Array.isArray(sections)) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
        No section data available.
      </div>
    )
  }

  const conflicts = data?.conflicts && typeof data.conflicts === 'object'
    ? data.conflicts
    : {}

  return (
    <div style={{ padding: '1rem', overflowX: 'auto', fontFamily: 'system-ui, sans-serif' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>STR Key</th>
            <th style={thStyle}>County</th>
            <th style={thStyle}>Sec</th>
            <th style={thStyle}>Twp</th>
            <th style={thStyle}>Range</th>
            <th style={thStyle}>Landman</th>
            <th style={thStyle}>Activity</th>
            <th style={thStyle}>Price/NMA</th>
            <th style={thStyle}>Conflict</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((row) => {
            const hasConflict = Object.prototype.hasOwnProperty.call(
              conflicts,
              row.strKey,
            )
            const rowBg = hasConflict ? '#fde8e8' : '#ffffff'
            return (
              <tr key={String(row.id)} style={{ backgroundColor: rowBg }}>
                <td style={cellStyle}>{row.strKey}</td>
                <td style={cellStyle}>{row.county}</td>
                <td style={cellStyle}>{row.sec}</td>
                <td style={cellStyle}>{row.twp}</td>
                <td style={cellStyle}>{row.range}</td>
                <td style={cellStyle}>{row.landman}</td>
                <td style={cellStyle}>{row.activity}</td>
                <td style={cellStyle}>{row.priceNma}</td>
                <td
                  style={{
                    ...cellStyle,
                    color: hasConflict ? '#b91c1c' : undefined,
                    fontWeight: hasConflict ? 600 : undefined,
                  }}
                >
                  {hasConflict ? 'YES' : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
