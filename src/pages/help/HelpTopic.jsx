import { useParams, useNavigate } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import topics from '../../help/topics.js';

const useStyles = makeStyles({
  page: {
    // no padding — command bar is full-width sticky
  },
  pageBody: {
    padding: '16px 24px',
  },
  breadcrumb: {
    marginBottom: '8px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
    marginBottom: '20px',
  },
  bannerWrapper: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  banner: {
    maxHeight: '200px',
    maxWidth: '100%',
    objectFit: 'contain',
    display: 'block',
    borderRadius: tokens.borderRadiusMedium,
  },
  markdownWrapper: {
    '& .wmde-markdown': {
      fontFamily: tokens.fontFamilyBase,
      fontSize: tokens.fontSizeBase300,
      backgroundColor: 'transparent',
    },
  },
});

export default function HelpTopic() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { topicId } = useParams();

  const topic = topics.find((t) => t.id === topicId);

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => navigate(-1)}
        locked
      >
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          size="small"
          onClick={() => navigate('/help')}
        >
          Close
        </Button>
      </FormCommandBar>
      <div className={styles.pageBody}>
        <Breadcrumb className={styles.breadcrumb}>
          <BreadcrumbItem>
            <BreadcrumbButton onClick={() => navigate('/help')}>Help</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            {topic?.title || topicId}
          </BreadcrumbItem>
        </Breadcrumb>
        <Text className={styles.title}>{topic?.title || 'Help Topic'}</Text>

        {topic ? (
          <>
            {topic.banner && (
              <div className={styles.bannerWrapper}>
                <img src={topic.banner} alt="" className={styles.banner} />
              </div>
            )}
            <div className={styles.markdownWrapper} data-color-mode="light">
              <MDEditor.Markdown source={topic.content} />
            </div>
          </>
        ) : (
          <MessageBar intent="error">
            <MessageBarBody>Topic not found.</MessageBarBody>
          </MessageBar>
        )}
      </div>
    </div>
  );
}
