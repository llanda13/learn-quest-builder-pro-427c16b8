interface ISODocumentHeaderProps {
  docNo?: string;
  effectiveDate?: string;
  revNo?: string;
  pageInfo?: string;
  institution?: string;
}

export function ISODocumentHeader({
  docNo = 'F-DOI-018',
  effectiveDate = '08/25/2017',
  revNo = '0',
  pageInfo = '1 of 1',
  institution,
}: ISODocumentHeaderProps) {
  const institutionName = institution || 'AGUSAN DEL SUR STATE COLLEGE OF AGRICULTURE AND TECHNOLOGY';

  return (
    <div className="iso-doc-header" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12pt',
      marginBottom: '8pt',
      fontFamily: '"Times New Roman", Times, serif',
    }}>
      {/* Logo */}
      <div style={{ flexShrink: 0, width: '72pt', height: '72pt' }}>
        <img
          src="/images/institution-logo.png"
          alt="Institution Logo"
          style={{ width: '72pt', height: '72pt', objectFit: 'contain', background: '#ffffff', borderRadius: 0 }}
          crossOrigin="anonymous"
        />
      </div>

      {/* Center: Institution Info */}
      <div style={{ flex: 1, textAlign: 'left', paddingTop: '2pt' }}>
        <div style={{ fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase' }}>
          {institutionName}
        </div>
        <div style={{ fontSize: '9pt' }}>Bunawan, Agusan del Sur</div>
        <div style={{ fontSize: '9pt' }}>
          website: <span style={{ textDecoration: 'underline' }}>http://asscat.edu.ph</span>
        </div>
        <div style={{ fontSize: '9pt' }}>
          email address: <span style={{ textDecoration: 'underline' }}>op@asscat.edu.ph</span>; mobile no.: +639486379266
        </div>
      </div>

      {/* Right: ISO metadata table */}
      <div style={{ flexShrink: 0 }}>
        <table style={{
          borderCollapse: 'collapse',
          fontSize: '8.5pt',
        }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontWeight: 'normal' }}>Doc No.:</td>
              <td style={{ border: '1px solid #000', padding: '2px 6px' }}>{docNo}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontWeight: 'normal' }}>Effective Date:</td>
              <td style={{ border: '1px solid #000', padding: '2px 6px' }}>{effectiveDate}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontWeight: 'normal' }}>Rev No.:</td>
              <td style={{ border: '1px solid #000', padding: '2px 6px' }}>{revNo}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '2px 6px', fontWeight: 'normal' }}>Page No.:</td>
              <td style={{ border: '1px solid #000', padding: '2px 6px' }}>{pageInfo}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
