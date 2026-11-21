import { jsPDF } from 'jspdf';

export interface CertificatePdfInput {
  participantName: string;
  workshopName: string;
  certificateCode: string;
  issuedAt: string;
}

export function downloadCertificatePdf(cert: CertificatePdfInput): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Clean white background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, 'F');

  // Outer SkillConnect deep green frame (#0f382a)
  doc.setDrawColor(15, 56, 42);
  doc.setLineWidth(14);
  doc.rect(22, 22, width - 44, height - 44);

  // Inner emerald accent border (#10b981)
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(2);
  doc.rect(38, 38, width - 76, height - 76);

  // Top emblem badge
  doc.setFillColor(15, 56, 42);
  doc.roundedRect(width / 2 - 28, 62, 56, 36, 8, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SC', width / 2, 85, { align: 'center' });

  // Organization label
  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SKILLCONNECT COMMUNITY LEARNING', width / 2, 124, {
    align: 'center'
  });

  // Main title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.text('Certificate of Completion', width / 2, 168, {
    align: 'center'
  });

  // Divider line
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(2);
  doc.line(width / 2 - 100, 186, width / 2 + 100, 186);

  // Body statement
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('This is to proudly certify that', width / 2, 224, {
    align: 'center'
  });

  // Participant name
  doc.setTextColor(15, 56, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text(cert.participantName || 'SkillConnect Participant', width / 2, 268, {
    align: 'center',
    maxWidth: width - 160
  });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(
    'has actively attended and successfully completed the community workshop',
    width / 2,
    308,
    { align: 'center' }
  );

  // Workshop box highlight
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.setLineWidth(1);
  doc.roundedRect(width / 2 - 240, 326, 480, 52, 8, 8, 'FD');

  doc.setTextColor(6, 95, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(cert.workshopName, width / 2, 359, {
    align: 'center',
    maxWidth: 450
  });

  // Footer metadata & signature line
  const formattedDate = new Date(cert.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const footerY = height - 110;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.line(90, footerY, 270, footerY);
  doc.line(width - 270, footerY, width - 90, footerY);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formattedDate, 180, footerY - 10, { align: 'center' });
  doc.text(cert.certificateCode, width - 180, footerY - 10, {
    align: 'center'
  });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Completion Date', 180, footerY + 16, { align: 'center' });
  doc.text('Certificate Verification ID', width - 180, footerY + 16, {
    align: 'center'
  });

  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Verified · SkillConnect Program Director', width / 2, footerY + 16, {
    align: 'center'
  });

  const safeCode = cert.certificateCode.replace(/[^A-Z0-9_-]/gi, '');
  doc.save(`SkillConnect-Certificate-${safeCode}.pdf`);
}
